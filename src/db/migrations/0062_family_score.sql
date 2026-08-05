-- ═══════════════════════════════════════════════════════════════════════════
-- 0062 — a parent's score lives on its family
--
-- 0060 retired scores of brains with zero notes, and was right for leaves —
-- but a PARENT brain holds no notes of its own by design: its children do,
-- and its exam deliberately runs over the whole family. slot-studio (903
-- family notes, honest 45%), svelte and ai-sdk lost real scores to a check
-- that never asked about children. The trigger learns the family, and the
-- scores come back from the last completed sitting they were earned at.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function bump_brain_counts() returns trigger
language plpgsql as $$
declare
  family_notes int;
begin
  update brains b set
    note_count = (select count(*) from notes n
                   where n.brain_id = b.id and n.status = 'active'),
    source_count = (select count(*) from sources s where s.brain_id = b.id),
    updated_at = now()
  where b.id = coalesce(new.brain_id, old.brain_id);

  -- The score check is family-wide: a parent's exam runs over its children's
  -- notes, so the corpus that has to be empty before the claim dies is the
  -- family's, not the row's own.
  select count(*) into family_notes from notes n
   where n.status = 'active'
     and (n.brain_id = coalesce(new.brain_id, old.brain_id)
          or n.brain_id in (select c.id from brains c
                             where c.parent_id = coalesce(new.brain_id, old.brain_id)));
  if family_notes = 0 then
    update brains set score = null, score_at = null
     where id = coalesce(new.brain_id, old.brain_id) and score is not null;
  end if;

  -- A leaf's notes also carry its parent's claim: emptying the last child
  -- must retire the parent's score too, and refilling must not (the parent
  -- re-earns it at its next sitting).
  update brains p set score = null, score_at = null
   where p.id = (select parent_id from brains
                  where id = coalesce(new.brain_id, old.brain_id))
     and p.score is not null
     and not exists (
       select 1 from notes n
        where n.status = 'active'
          and (n.brain_id = p.id
               or n.brain_id in (select c.id from brains c where c.parent_id = p.id)));
  return null;
end $$;

-- Give back what 0060 took from parents whose families are alive: the score
-- from their most recent completed sitting.
update brains b
   set score = r.score, score_at = r.finished_at
  from (select distinct on (brain_id) brain_id, score, finished_at
          from check_runs
         where status = 'done' and score is not null
         order by brain_id, started_at desc) r
 where r.brain_id = b.id
   and b.score is null
   and exists (select 1 from notes n
                 join brains c on c.id = n.brain_id
                where c.parent_id = b.id and n.status = 'active');
