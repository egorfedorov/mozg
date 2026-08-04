-- ═══════════════════════════════════════════════════════════════════════════
-- 0020 — extraction cache
--
-- Extraction is the step that costs money, and the same text extracted for
-- the same goal produces the same notes. Keyed by content hash, model AND a
-- hash of the goal, because extraction is deliberately goal-aware: reusing
-- notes across different goals would fill a brain with facts extracted for
-- someone else's purpose — cheaper, and quietly worse, which is the one
-- trade this product must never make. An exact-goal hit is still frequent:
-- re-crawls, re-adds of the same page, and re-reads after note cleanup.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists extract_cache (
  content_hash text not null,
  model        text not null,
  goal_hash    text not null,
  payload      jsonb not null,
  note_count   int not null,
  created_at   timestamptz not null default now(),
  primary key (content_hash, model, goal_hash)
);
