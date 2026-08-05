-- ═══════════════════════════════════════════════════════════════════════════
-- 0063 — verdicts remember their evidence
--
-- check_results kept a hit COUNT and a top score, but not WHICH notes the
-- judge actually read. Recording the note ids per verdict is what makes an
-- agent's report card computable: "the notes this agent wrote were the
-- evidence behind N passing answers" is attribution, not vibes. Backfills
-- nothing — evidence accumulates as brains re-sit.
-- ═══════════════════════════════════════════════════════════════════════════

alter table check_results add column if not exists evidence uuid[];
