-- ═══════════════════════════════════════════════════════════════════════════
-- 0076 — a workflow: the order the brains are read in
--
-- A brain answers "what is true about X". Nobody buys that to admire it; they
-- buy it to get something built, and the part that is missing when an agent is
-- told "make a slot game for Stake Engine" is not knowledge — it is the route.
-- Which of the shelf's brains, in what order, asked what, and how you know a
-- step is done.
--
-- That route is data, not an engine. The agent already executes: it reads, it
-- writes files, it runs the checks. So a workflow is stored here, served whole
-- through MCP, and run by whatever agent the user has — no runtime of ours, no
-- sandbox, no second place where models are paid.
--
-- Steps live in jsonb rather than a child table on purpose. They are edited as
-- one list, always read as one list, and never queried across workflows —
-- a table would buy ordering pain and joins for nothing.
-- ═══════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';

create table if not exists workflows (
  id         uuid primary key default gen_random_uuid(),
  owner_id   text not null references "user"(id) on delete cascade,
  -- The public name, under the owner's handle: /w/{handle}/{slug}, the same
  -- shape brains use so one mental model covers both.
  slug       text not null,
  title      text not null,
  -- What it builds, in one line. This is what the agent matches against when
  -- the user says "build me a slot game" without naming a workflow.
  summary    text,
  -- [{ title, brain, ask, done_when }] — see src/lib/workflows.ts for the
  -- shape and why each field earns its place.
  steps      jsonb not null default '[]'::jsonb,
  visibility text not null default 'private'
             check (visibility in ('private', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slug)
);

-- The catalogue page lists public ones newest first; owners list their own.
create index if not exists workflows_public_idx
  on workflows (updated_at desc) where visibility = 'public';
create index if not exists workflows_owner_idx on workflows (owner_id, updated_at desc);
