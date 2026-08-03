-- ═══════════════════════════════════════════════════════════════════════════
-- 0001 — core application schema
--
-- Identity lives in better-auth's own tables ("user", "session", "account",
-- "verification"), created by `npx @better-auth/cli migrate` BEFORE this runs.
-- We extend "user" with app columns rather than keeping a second profile table.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists vector;
create extension if not exists pg_trgm;
create extension if not exists citext;

-- ─── app columns on better-auth's user table ────────────────────────────────

-- better-auth may have created these already from `additionalFields`, so each
-- step is separately idempotent — a bundled `add column ... check (...)` would
-- silently skip the constraint when the column is already there.
alter table "user" add column if not exists plan text;
alter table "user" add column if not exists handle text;

update "user" set plan = 'free' where plan is null;
alter table "user" alter column plan set default 'free';
alter table "user" alter column plan set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_plan_check') then
    alter table "user" add constraint user_plan_check
      check (plan in ('free', 'pro', 'team'));
  end if;
end $$;

-- Handle is the public namespace for a user's brains: /b/{handle}/{slug}.
-- Backfilled from email local-part on first login if absent.
create unique index if not exists user_handle_key on "user" (handle)
  where handle is not null;

-- ─── brains ─────────────────────────────────────────────────────────────────

create table if not exists brains (
  id              uuid primary key default gen_random_uuid(),
  owner_id        text not null references "user"(id) on delete cascade,
  slug            text not null,
  title           text not null,
  goal            text,
  color           text not null default 'amber',
  visibility      text not null default 'private'
                  check (visibility in ('private', 'link', 'public')),
  license         text not null default 'nc'
                  check (license in ('nc', 'mit', 'proprietary')),
  score           int check (score between 0 and 100),
  score_at        timestamptz,
  review_required boolean not null default true,
  note_count      int not null default 0,
  source_count    int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint brains_slug_format check (slug ~ '^[a-z0-9][a-z0-9_-]{0,38}$'),
  unique (owner_id, slug)
);

create index if not exists brains_owner_idx on brains (owner_id, updated_at desc);
create index if not exists brains_public_idx on brains (updated_at desc)
  where visibility = 'public';

-- ─── sources ────────────────────────────────────────────────────────────────

create table if not exists sources (
  id            uuid primary key default gen_random_uuid(),
  brain_id      uuid not null references brains(id) on delete cascade,
  kind          text not null check (kind in ('image', 'text', 'url', 'file')),
  storage_key   text,
  original_name text,
  mime          text,
  bytes         int,
  url           text,
  status        text not null default 'queued'
                check (status in ('queued', 'processing', 'ready', 'failed', 'rejected')),
  reject_reason text,
  findings      jsonb,          -- masked secret-scan hits, shown to the user
  error         text,
  note_count    int not null default 0,
  cost_cents    int,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);

create index if not exists sources_brain_idx on sources (brain_id, created_at desc);
create index if not exists sources_status_idx on sources (status)
  where status in ('queued', 'processing');

-- ─── notes: the extracted knowledge ─────────────────────────────────────────

create table if not exists notes (
  id            uuid primary key default gen_random_uuid(),
  brain_id      uuid not null references brains(id) on delete cascade,
  source_id     uuid references sources(id) on delete set null,
  title         text not null,
  body          text not null,
  category      text,
  kind          text not null default 'fact'
                check (kind in ('fact', 'rule', 'layout', 'example', 'pitfall')),
  confidence    real not null default 0.8,
  author        text not null default 'ingest'
                check (author in ('ingest', 'human', 'agent')),
  agent_client  text,
  status        text not null default 'active'
                check (status in ('active', 'pending', 'superseded', 'rejected')),
  superseded_by uuid references notes(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists notes_brain_idx on notes (brain_id, status);
create index if not exists notes_pending_idx on notes (brain_id, created_at desc)
  where status = 'pending';

-- ─── chunks: what search actually runs over ─────────────────────────────────

create table if not exists chunks (
  id          uuid primary key default gen_random_uuid(),
  brain_id    uuid not null references brains(id) on delete cascade,
  note_id     uuid not null references notes(id) on delete cascade,
  content     text not null,
  token_count int not null default 0,
  embedding   vector(1024),
  -- lazy: 'simple' config indexes ru+en in one column without stemming.
  -- Upgrade to per-language configs when the exam shows FTS is the bottleneck.
  tsv         tsvector generated always as (to_tsvector('simple', content)) stored
);

create index if not exists chunks_brain_idx on chunks (brain_id);
create index if not exists chunks_tsv_idx on chunks using gin (tsv);
create index if not exists chunks_embedding_idx on chunks
  using hnsw (embedding vector_cosine_ops);

-- ─── the exam (point B) ─────────────────────────────────────────────────────

create table if not exists checks (
  id         uuid primary key default gen_random_uuid(),
  brain_id   uuid not null references brains(id) on delete cascade,
  category   text not null,
  question   text not null,
  expect     text not null,
  weight     int not null default 1 check (weight between 1 and 5),
  origin     text not null default 'generated'
             check (origin in ('generated', 'manual')),
  enabled    boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists checks_brain_idx on checks (brain_id) where enabled;

create table if not exists check_runs (
  id          uuid primary key default gen_random_uuid(),
  brain_id    uuid not null references brains(id) on delete cascade,
  score       int check (score between 0 and 100),
  model       text,
  cost_cents  int,
  status      text not null default 'running'
              check (status in ('running', 'done', 'failed')),
  error       text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists check_runs_brain_idx on check_runs (brain_id, started_at desc);

create table if not exists check_results (
  run_id   uuid not null references check_runs(id) on delete cascade,
  check_id uuid not null references checks(id) on delete cascade,
  passed   boolean not null,
  got      text,
  reason   text,
  primary key (run_id, check_id)
);

-- ─── sharing ────────────────────────────────────────────────────────────────

create table if not exists grants (
  id          uuid primary key default gen_random_uuid(),
  brain_id    uuid not null references brains(id) on delete cascade,
  email       citext not null,
  role        text not null default 'viewer' check (role in ('viewer', 'contributor')),
  accepted_by text references "user"(id) on delete set null,
  invited_by  text not null references "user"(id) on delete cascade,
  invited_at  timestamptz not null default now(),
  unique (brain_id, email)
);

create index if not exists grants_email_idx on grants (email);

-- ─── MCP tokens ─────────────────────────────────────────────────────────────

create table if not exists mcp_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null references "user"(id) on delete cascade,
  token_hash   text not null unique,
  prefix       text not null,          -- first 8 chars, for display
  name         text,
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists mcp_tokens_user_idx on mcp_tokens (user_id)
  where revoked_at is null;

-- ─── call metering ──────────────────────────────────────────────────────────
--
-- caller_id is WHO CALLED, not who owns the brain. That distinction is what
-- makes free sharing survivable (the consumer's quota is charged, not the
-- author's) and it is the same table billing will read in v3.

create table if not exists calls (
  id         bigserial primary key,
  brain_id   uuid references brains(id) on delete set null,
  caller_id  text not null references "user"(id) on delete cascade,
  owner_id   text references "user"(id) on delete set null,
  tool       text not null,
  query      text,
  results    int,
  latency_ms int,
  ok         boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists calls_caller_month_idx on calls (caller_id, created_at desc);
create index if not exists calls_brain_idx on calls (brain_id, created_at desc);

-- ─── keep counters honest ───────────────────────────────────────────────────

create or replace function bump_brain_counts() returns trigger
language plpgsql as $$
begin
  update brains b set
    note_count = (select count(*) from notes n
                   where n.brain_id = b.id and n.status = 'active'),
    source_count = (select count(*) from sources s where s.brain_id = b.id),
    updated_at = now()
  where b.id = coalesce(new.brain_id, old.brain_id);
  return null;
end $$;

drop trigger if exists notes_count_trg on notes;
create trigger notes_count_trg after insert or update or delete on notes
  for each row execute function bump_brain_counts();

drop trigger if exists sources_count_trg on sources;
create trigger sources_count_trg after insert or delete on sources
  for each row execute function bump_brain_counts();
