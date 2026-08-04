-- ═══════════════════════════════════════════════════════════════════════════
-- 0036 — the exam probes for bluffing
--
-- A brain that answers everything is worse than one that admits a gap: the
-- agent trusting it cannot tell confidence from knowledge. So the exam now
-- includes a few negative checks — plausible questions OUTSIDE the brain's
-- scope, where the only correct behaviour is a refusal. kind tells them
-- apart from real coverage checks everywhere a verdict is read (scoring,
-- diagnosis, gap lists), which a magic category string could not survive.
-- ═══════════════════════════════════════════════════════════════════════════

alter table checks
  add column if not exists kind text not null default 'positive'
    check (kind in ('positive', 'negative'));
