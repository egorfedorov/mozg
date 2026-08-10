-- ═══════════════════════════════════════════════════════════════════════════
-- 0079 — what happened when somebody actually walked the route
--
-- A brain improves because the exam says which questions it fails. A route has
-- no such signal: its author finds out it was wrong when somebody tells them,
-- which is to say almost never. But the agent that just walked it knows
-- exactly what went wrong — which step had no material behind it, which check
-- would not pass — and it knows it while it is still holding the context.
--
-- So it reports, and the report is per step. Nothing here is a rating: "3
-- stars" tells an author nothing they can act on, while "step 4 found nothing
-- in stake-engine-rgs-api" names the fix.
-- ═══════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';

create table if not exists workflow_runs (
  id          uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  -- Who ran it. Null-safe on delete: the lesson outlives the account.
  runner_id   text references "user"(id) on delete set null,
  /**
   * [{ step: 1, brain: "mozg/x", found: true, passed: true, note: "…" }]
   * Shape lives in src/lib/workflow-runs.ts; kept as jsonb for the same
   * reason the steps are — written once, read whole, never queried across.
   */
  steps       jsonb not null default '[]'::jsonb,
  -- One line from the agent about the run as a whole.
  summary     text,
  created_at  timestamptz not null default now()
);

create index if not exists workflow_runs_wf_idx
  on workflow_runs (workflow_id, created_at desc);
