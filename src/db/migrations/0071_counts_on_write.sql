-- ═══════════════════════════════════════════════════════════════════════════
-- 0071 — the counter trigger stops re-reading the catalogue on every note
--
-- bump_brain_counts fires for each row of notes and sources. Besides the two
-- counters it maintains, it also asked the question 0060 and 0062 added: "is
-- this family's corpus now empty, and must the exam score be retired?" It
-- asked on every write, including the tens of thousands of INSERTs an ingest
-- makes — and an INSERT cannot empty anything.
--
-- The asking was not cheap either. `brain_id = X or brain_id in (subquery)`
-- cannot use notes_brain_idx as a range, so it scanned every active note in
-- the database and threw away the ones from other brains. Measured on prod
-- against the largest family (expo, 6,652 family notes out of 59,077 active):
--
--   own-brain note count      0.60 ms   index-only, 3,140 rows
--   source count              0.19 ms   index-only, 269 rows
--   family count (old shape)  9.40 ms   scans 54,432 index entries
--   family count (new shape)  1.07 ms   index-only, per family member
--
-- So ~92% of the trigger's work per inserted note was a question with a known
-- answer, and its cost grew with the size of the whole catalogue rather than
-- the brain being written to — every brain got slower to ingest as unrelated
-- brains grew. On expo's 3,140 notes that is about a minute of trigger time
-- per full ingest, before the supersede updates fire it all again.
--
-- Two changes, no schema change and no incremental counters (a counter that
-- drifts puts a wrong number on the storefront; a recount cannot drift):
--
--   1. The score-retirement blocks run only when a write could have REMOVED
--      an active note — a DELETE, or an UPDATE that moved a note out of
--      'active'. Inserts and activations skip them.
--   2. The family predicate is rewritten so both remaining scans are
--      index-only over the family, not over every note in the database.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function bump_brain_counts() returns trigger
language plpgsql as $$
declare
  target uuid;
  -- Could this write have taken an active note away? Only then is the corpus
  -- worth re-examining.
  lost boolean := false;
  family_notes int;
begin
  -- Written out rather than folded into one expression: plpgsql evaluates
  -- both sides of an OR, and touching OLD on an INSERT is an error.
  if tg_op = 'DELETE' then
    target := old.brain_id;
    lost := true;
  elsif tg_op = 'UPDATE' then
    target := new.brain_id;
    lost := old.status = 'active' and new.status <> 'active';
  else
    target := new.brain_id;
  end if;

  update brains b set
    note_count = (select count(*) from notes n
                   where n.brain_id = b.id and n.status = 'active'),
    source_count = (select count(*) from sources s where s.brain_id = b.id),
    updated_at = now()
  where b.id = target;

  if not lost then
    return null;
  end if;

  -- The score check is family-wide: a parent's exam runs over its children's
  -- notes, so the corpus that has to be empty before the claim dies is the
  -- family's, not the row's own.
  select count(*) into family_notes
    from notes n
   where n.status = 'active'
     and n.brain_id = any (array(
           select target
            union all
           select c.id from brains c where c.parent_id = target));

  if family_notes = 0 then
    update brains set score = null, score_at = null
     where id = target and score is not null;
  end if;

  -- A leaf's notes also carry its parent's claim: emptying the last child
  -- must retire the parent's score too, and refilling must not (the parent
  -- re-earns it at its next sitting).
  update brains p set score = null, score_at = null
   where p.id = (select parent_id from brains where id = target)
     and p.score is not null
     and not exists (
       select 1 from notes n
        where n.status = 'active'
          and n.brain_id = any (array(
                select p.id
                 union all
                select c.id from brains c where c.parent_id = p.id)));
  return null;
end $$;
