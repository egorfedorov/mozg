-- Payout requests.
--
-- Payouts are manual: an author asks, we send crypto by hand, we mark it paid.
-- The row exists so the ask is a record rather than an email thread. The money
-- is held the moment the ask is made (a 'payout' debit, refunded on rejection),
-- so the balance a request reserves cannot be spent again while it waits — and
-- the ledger stays the single source of truth for what anyone holds.

create table if not exists payouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null references "user"(id) on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  -- Where to send it. Free text on purpose: chains and wallet formats change
  -- faster than a column would, and a human reads this before sending.
  destination  text not null,
  status       text not null default 'requested'
                 check (status in ('requested', 'paid', 'rejected')),
  note         text,
  requested_at timestamptz not null default now(),
  settled_at   timestamptz
);

-- One open request at a time: a second one while the first is pending is a
-- double-spend of the same balance waiting to happen.
create unique index if not exists payouts_one_open_per_user
  on payouts (user_id) where status = 'requested';

create index if not exists payouts_status_idx on payouts (status, requested_at);
