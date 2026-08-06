-- ═══════════════════════════════════════════════════════════════════════════
-- 0072 — a brain's history, as one stream
--
-- The plan on the table was an event log: every change to a brain appended to
-- a journal, the way git keeps a reflog. Reading the schema first killed most
-- of it, and that is the good news — nearly all of that history is already
-- recorded, just not in one place:
--
--   a note joined the corpus      notes.created_at
--   a note left it, and why       notes.superseded_at, superseded_reason,
--                                 superseded_by
--   a stranger proposed one       notes.status = 'pending', proposed_by
--   a source arrived              sources.created_at
--   the brain was graded          check_runs.finished_at, score
--
-- Appending an event row per note would restate notes.created_at 59,000 times
-- and put a second write in the hot path we just made cheaper in 0071. So the
-- stream is a view, not a table: nothing new is written, nothing can drift out
-- of step with the rows it describes, and "what changed between these dates"
-- becomes one query instead of five.
--
-- One thing genuinely WAS being destroyed, and that gets a table.
-- ═══════════════════════════════════════════════════════════════════════════

-- Every refresh that found the page different. Until now a re-read incremented
-- sources.refresh_count and overwrote changed_at, so the fifth refresh erased
-- the memory of the fourth: a source could say "changed 5 times, last on
-- Tuesday" and nothing more. That is exactly the history a buyer is asking
-- for when they ask whether a brain is maintained.
--
-- Only refreshes that CHANGED something are recorded. The scheduled pass looks
-- at every URL source every three days and almost always finds nothing; a row
-- per look would add ~1,500 a day that say "still the same", which
-- sources.checked_at already says in one column.
create table if not exists source_refreshes (
  id            bigserial primary key,
  source_id     uuid not null references sources(id) on delete cascade,
  -- Denormalised from the source so the timeline can filter by brain without
  -- a join, and so the row survives as history if the source is deleted...
  -- which it does not, on purpose: the cascade keeps the two consistent.
  brain_id      uuid not null references brains(id) on delete cascade,
  at            timestamptz not null default now(),
  -- What the page hashed to after this refresh. Two consecutive rows are a
  -- diff you can prove: these are different pages, not a re-run.
  content_hash  text,
  -- How many notes the change retired. The size of the delta, without having
  -- to count superseded notes by timestamp.
  notes_retired int not null default 0
);

create index if not exists source_refreshes_brain_idx
  on source_refreshes (brain_id, at desc);
create index if not exists source_refreshes_source_idx
  on source_refreshes (source_id, at desc);

-- What is recoverable of the refreshes that happened before this table: the
-- LAST change to each source that has ever changed. The earlier ones are gone
-- — refresh_count knows they happened, changed_at overwrote when. Backfilling
-- the one we can is the difference between a history that starts today and a
-- history with one honest gap in it.
insert into source_refreshes (source_id, brain_id, at, content_hash, notes_retired)
select s.id, s.brain_id, s.changed_at, s.content_hash,
       (select count(*) from notes n
         where n.source_id = s.id and n.status = 'superseded')::int
  from sources s
 where s.refresh_count > 0 and s.changed_at is not null
   and not exists (select 1 from source_refreshes r where r.source_id = s.id);

-- ─── the stream ─────────────────────────────────────────────────────────────
--
-- One row per thing that happened to a brain, newest-first when ordered by
-- `at`. `value` carries the one number each kind has — a score, a count — so a
-- reader does not need a join to render a line.
--
-- No new indexes: every branch filters on a brain_id that is already the
-- leading column of an index, and the sort is over one brain's rows. An index
-- on (brain_id, created_at) would tax the insert path 0071 just cleaned up, to
-- save a sort of a few thousand rows.
create or replace view brain_timeline as
  select n.brain_id,
         n.created_at as at,
         case when n.status = 'pending' then 'note_proposed' else 'note_added' end as kind,
         n.id as subject_id,
         n.title as title,
         null::int as value,
         coalesce(n.proposed_by, n.author) as actor
    from notes n
   where n.status <> 'rejected'

   union all

  select n.brain_id, n.superseded_at, 'note_superseded', n.id, n.title,
         null::int, coalesce(n.superseded_reason, 'replaced')
    from notes n
   where n.superseded_at is not null

   union all

  select s.brain_id, s.created_at, 'source_added', s.id,
         coalesce(s.original_name, s.url, s.kind), null::int, s.kind
    from sources s

   union all

  select r.brain_id, r.at, 'source_changed', r.source_id,
         (select coalesce(s.original_name, s.url) from sources s where s.id = r.source_id),
         r.notes_retired, 'refresh'
    from source_refreshes r

   union all

  select c.brain_id, c.finished_at, 'exam_sat', c.id, c.kind, c.score, 'exam'
    from check_runs c
   where c.status = 'done' and c.finished_at is not null;
