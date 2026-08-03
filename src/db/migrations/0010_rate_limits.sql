-- Per-user throttles for buttons that burn platform money — exam runs and
-- ingest retries spend the Anthropic budget but are not MCP calls, so the
-- calls table (which meters agents) cannot throttle them.
--
-- One row per action occurrence, counted over a trailing window. Soft on
-- purpose: two clicks in the same millisecond can both pass the check, and
-- that is fine — this bounds a stuck button or a scripted loop, not a race.

create table if not exists rate_limits (
  id         bigserial primary key,
  user_id    text not null references "user"(id) on delete cascade,
  action     text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limits_user_action_idx
  on rate_limits (user_id, action, created_at desc);
