-- The exam now records what retrieval returned for each check: how many
-- passages search found, and the score of the best one. Until now a failed
-- check was ambiguous between "the brain holds nothing on this" and "the
-- material is there but search missed it" — two opposite fixes (add material
-- vs rephrase/reindex), shown as the same red row.
--
-- Nullable on purpose: runs from before this migration have no signal, and
-- the UI (lib/brains.ts gap labels) must read null as "unknown", not as zero
-- hits.

alter table check_results
  add column if not exists retrieval_hits int,
  add column if not exists retrieval_top_score real;
