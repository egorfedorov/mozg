-- ═══════════════════════════════════════════════════════════════════════════
-- 0044 — learner achievements
--
-- The course page duels the learner against the brain's own exam score.
-- Winning once is a fact worth keeping: without a table the badge would
-- flicker off again whenever the brain re-sits its exam and climbs back
-- ahead. One row per person per brain per kind; the unique key makes the
-- first crossing idempotent, so the page can record on render without a
-- separate write path.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists achievements (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null references "user"(id) on delete cascade,
  brain_id    uuid not null references brains(id) on delete cascade,
  kind        text not null check (kind in ('beat_the_agent')),
  achieved_at timestamptz not null default now(),
  unique (user_id, brain_id, kind)
);

create index if not exists achievements_user_idx on achievements (user_id, kind);
