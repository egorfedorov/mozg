-- ═══════════════════════════════════════════════════════════════════════════
-- 0021 — gift links
--
-- An author seeding a community needs to hand out access without handing out
-- money flows: a link, N uses, done. Redeeming writes an ordinary grant — the
-- same row a manual share writes — so every downstream check (MCP, web,
-- family scope) already knows what to do with it. No parallel access system.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists gift_links (
  id         uuid primary key default gen_random_uuid(),
  brain_id   uuid not null references brains(id) on delete cascade,
  code       text not null unique,
  uses_left  int not null check (uses_left >= 0),
  created_by text not null references "user"(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists gift_links_brain_idx on gift_links (brain_id);
