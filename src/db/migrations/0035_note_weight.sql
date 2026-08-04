-- ═══════════════════════════════════════════════════════════════════════════
-- 0035 — notes carry a usage weight
--
-- Feedback was one-directional: agents could report a note as wrong, but a
-- note that kept proving itself had no way to earn standing. Now a flag
-- carries a signal ('up' or 'down'; existing rows are all 'down' — they were
-- written by the old report-only tool), and the note caches the result as a
-- materialised weight, recomputed whenever its flags change (see
-- src/lib/note-weight.ts — the formula lives in exactly one place).
--
-- Materialised, not a search-time join: the aggregate runs once per flag
-- write instead of once per search, and the clamp (0.5–2.0) is enforced by
-- the check constraint, so a pathological flag history cannot produce a
-- weight the ranker was not designed to absorb.
-- ═══════════════════════════════════════════════════════════════════════════

alter table notes
  add column if not exists weight real not null default 1.0
    check (weight between 0.5 and 2.0);

alter table note_flags
  add column if not exists signal text not null default 'down'
    check (signal in ('up', 'down'));
