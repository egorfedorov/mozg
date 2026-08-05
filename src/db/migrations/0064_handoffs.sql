-- ═══════════════════════════════════════════════════════════════════════════
-- 0064 — handoffs: the baton between agents
--
-- A handoff is working state, not knowledge: "stopped at the migration,
-- schema is done, the worker still writes to the old column" is exactly what
-- the NEXT session needs and exactly what must never become a note — notes
-- are durable facts that sit exams; this is a baton that expires. Own table,
-- own lifecycle, never touches search or the exam.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists handoffs (
  id           uuid primary key default gen_random_uuid(),
  brain_id     uuid not null references brains(id) on delete cascade,
  author_id    text not null references "user"(id) on delete cascade,
  agent_client text,
  title        text not null,
  context      text not null,
  status       text not null default 'open' check (status in ('open', 'taken')),
  taken_by     text,
  taken_at     timestamptz,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days'
);

create index if not exists handoffs_brain_idx on handoffs (brain_id, status, expires_at);
