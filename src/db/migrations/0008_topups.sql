-- Crypto top-ups.
--
-- Our own record of what was asked for, created before the payment provider is
-- ever contacted. The webhook then credits *this* amount, matched by our own
-- reference — never the amount in the callback body. A callback is an
-- unauthenticated stranger until proven otherwise, and even after the signature
-- checks out, trusting its numbers means a provider bug or a replay becomes a
-- balance we cannot explain.

create table if not exists topups (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null references "user"(id) on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  provider     text not null,
  -- Ours, sent to the provider and echoed back. Unique so a replayed callback
  -- lands on a row that is already settled.
  reference    text not null unique,
  -- Theirs, recorded for support conversations.
  provider_ref text,
  status       text not null default 'pending'
                 check (status in ('pending', 'paid', 'failed', 'expired')),
  pay_url      text,
  created_at   timestamptz not null default now(),
  settled_at   timestamptz
);

create index if not exists topups_user_idx on topups (user_id, created_at desc);
create index if not exists topups_open_idx on topups (status, created_at)
  where status = 'pending';
