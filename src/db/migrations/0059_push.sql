-- ═══════════════════════════════════════════════════════════════════════════
-- 0059 — web push subscriptions
--
-- The operator's phone-in-pocket channel: a new chatmozg message or a payment
-- attempt should not wait for an admin tab to be open. One row per browser;
-- the endpoint is the identity (a browser re-subscribing replaces itself).
-- Only admins can create rows today — the subscribe route is behind
-- requireAdmin — but the table carries user_id so it does not need a
-- migration the day users get notification settings too.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null references "user"(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_user_idx on push_subscriptions (user_id);
