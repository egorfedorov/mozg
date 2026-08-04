-- ═══════════════════════════════════════════════════════════════════════════
-- 0040 — plan requests and paid-until
--
-- Checkout v1. There is still no card checkout: a user either asks for a plan
-- (an operator approves by hand) or pays for it from the balance, which
-- upgrades immediately. A paid plan is a 30-day purchase, not a subscription
-- — paid_until is set per payment, and wherever the plan is read an expired
-- one counts as free (lib/plans.ts effectivePlan). A plan set by hand
-- (admin) has paid_until null and never expires.
-- ═══════════════════════════════════════════════════════════════════════════

alter table "user" add column if not exists paid_until timestamptz;

create table if not exists plan_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null references "user"(id) on delete cascade,
  plan        text not null check (plan in ('pro', 'team')),
  status      text not null default 'pending'
              check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  -- 'balance' when the user's own payment closed it, an operator's email
  -- otherwise.
  resolved_by text
);

-- One open request per account — the second click finds the first.
create unique index if not exists plan_requests_one_open
  on plan_requests (user_id) where status = 'pending';

create index if not exists plan_requests_status_idx
  on plan_requests (status, created_at);

-- A plan paid from the balance is a ledger movement like any other, so the
-- kind check has to know about it.
alter table ledger drop constraint if exists ledger_kind_check;
alter table ledger add constraint ledger_kind_check
  check (kind in
    ('topup', 'purchase', 'earning', 'payout', 'refund', 'adjustment', 'plan'));
