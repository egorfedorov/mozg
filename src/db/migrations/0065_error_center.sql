-- ═══════════════════════════════════════════════════════════════════════════
-- 0065 — the error center
--
-- Errors lived in three places that all forget: container logs (wiped by
-- every deploy — today's reranker postmortem had to be reconstructed from
-- latency numbers), console.warn fallbacks nobody tails, and a calls.ok
-- boolean with no reason attached. One table, written from every layer,
-- read from one admin page, resolvable so the list stays a queue.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists app_errors (
  id          uuid primary key default gen_random_uuid(),
  -- Which layer reported: the web app, the worker, an MCP tool call, a
  -- browser, or a payment path.
  source      text not null check (source in ('app', 'worker', 'mcp', 'client', 'payments')),
  -- Short grouping key — 'ingest', 'exam', 'translate', 'unhandled'…
  kind        text not null,
  message     text not null,
  -- Stack / context. Admin-only surface, so pg details are fine here —
  -- exactly the things the MCP reply deliberately hides from callers.
  detail      text,
  user_id     text references "user"(id) on delete set null,
  brain_id    uuid references brains(id) on delete set null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists app_errors_open_idx
  on app_errors (created_at desc) where resolved_at is null;

-- The reason rides with the metering row: today's 24 failed calls took a
-- latency-forensics session to explain because ok=false carried no text.
alter table calls add column if not exists error text;
