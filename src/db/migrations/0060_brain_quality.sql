-- ═══════════════════════════════════════════════════════════════════════════
-- 0060 — a score may not outlive its notes
--
-- Three public brains carried exam scores with zero active notes: the notes
-- were deleted after the sitting and the number stayed on the storefront.
-- The score is the one factual claim this product makes, so the counter
-- trigger now retires it the moment the corpus it measured is gone — and
-- this migration retires the three that already lied.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function bump_brain_counts() returns trigger
language plpgsql as $$
begin
  update brains b set
    note_count = (select count(*) from notes n
                   where n.brain_id = b.id and n.status = 'active'),
    source_count = (select count(*) from sources s where s.brain_id = b.id),
    -- No notes, no claim: a score measured against a corpus that no longer
    -- exists is not stale, it is false.
    score = case when (select count(*) from notes n
                        where n.brain_id = b.id and n.status = 'active') = 0
                 then null else b.score end,
    score_at = case when (select count(*) from notes n
                           where n.brain_id = b.id and n.status = 'active') = 0
                    then null else b.score_at end,
    updated_at = now()
  where b.id = coalesce(new.brain_id, old.brain_id);
  return null;
end $$;

update brains set score = null, score_at = null
 where note_count = 0 and score is not null;
