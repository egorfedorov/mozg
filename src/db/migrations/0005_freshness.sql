-- Keeping a brain honest over time.
--
-- Three things go stale on their own: a documentation page changes and the
-- notes taken from it quietly become wrong; a brain accumulates material but
-- its score still reflects an exam run weeks ago; and two notes end up
-- claiming different things about the same subject.
--
-- These columns are what a maintenance pass needs to tell "unchanged" from
-- "not looked at recently", which is the difference between a cheap check and
-- re-reading the whole internet every night.

-- Fingerprint of the fetched body, so an unchanged page costs one request and
-- no extraction at all.
alter table sources add column if not exists content_hash text;
alter table sources add column if not exists checked_at timestamptz;
-- When the fetched content last actually differed from the previous fetch.
alter table sources add column if not exists changed_at timestamptz;
-- Set when a refresh replaces this source's notes, so the history is legible.
alter table sources add column if not exists refresh_count int not null default 0;

create index if not exists sources_refresh_idx on sources (checked_at nulls first)
  where kind = 'url' and status = 'ready';

-- Which source a note came from, so a refreshed page can supersede exactly the
-- notes it produced rather than everything in the brain. Nullable: notes
-- written by an agent or by hand have no source.
alter table notes add column if not exists source_id uuid
  references sources(id) on delete set null;

-- Why a note stopped being current. Free text, shown to the owner.
alter table notes add column if not exists superseded_by uuid
  references notes(id) on delete set null;
alter table notes add column if not exists superseded_reason text;
alter table notes add column if not exists superseded_at timestamptz;

create index if not exists notes_source_idx on notes (source_id)
  where status = 'active';

-- Last time the brain's content changed, and last time it sat an exam. A
-- re-exam is worth paying for only when the first is newer than the second.
alter table brains add column if not exists content_changed_at timestamptz;

create index if not exists brains_stale_idx on brains (content_changed_at)
  where goal is not null;

-- Backfill: everything that exists now counts as examined-as-of-its-score, and
-- changed as of its last update. Without this every brain looks stale on the
-- first maintenance pass and the queue re-exams the entire database at once.
update brains set content_changed_at = coalesce(score_at, updated_at)
 where content_changed_at is null;
