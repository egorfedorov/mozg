-- Exams from real search failures.
--
-- calls.top_score: the fused score of the best hit a brain_search returned.
-- results = 0 already told us "nothing found"; a low top score is the quieter
-- failure — something ranked, but only one retriever weakly agreed, which in
-- practice reads as a guess. The gap-harvest pass (src/worker/search-gaps.ts)
-- turns both into exam checks.
alter table calls add column if not exists top_score real;

-- Checks born from clustered weak searches get their own origin so the board
-- and any future pruning can tell them apart from goal-generated checks and
-- the raw zero-result ones ('usage').
alter table checks drop constraint if exists checks_origin_check;
alter table checks add constraint checks_origin_check
  check (origin in ('generated', 'manual', 'usage', 'search_gap'));

-- The harvest reads recent weak calls per brain.
create index if not exists calls_weak_search_idx
  on calls (brain_id, created_at desc)
  where tool = 'brain_search' and ok;
