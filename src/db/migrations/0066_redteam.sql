-- ═══════════════════════════════════════════════════════════════════════════
-- 0066 — red-team runs
--
-- "Our brain is the only one whose poisoning resistance is measured" needs
-- somewhere to keep the measurements. One row per attack per run; the
-- brain page shows the latest run with its date, and maintenance re-runs
-- the battery weekly so the date stays honest.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists redteam_runs (
  id       uuid primary key default gen_random_uuid(),
  brain_id uuid not null references brains(id) on delete cascade,
  attack   text not null,
  survived boolean not null,
  detail   text,
  ran_at   timestamptz not null default now()
);

create index if not exists redteam_brain_idx on redteam_runs (brain_id, ran_at desc);
