-- Earn with mozg — the referral programme.
--
-- Deliberately small. Three of the four things a referral system needs already
-- existed and are reused rather than rebuilt:
--
--   the code      → "user".handle, already unique and already public (/b/{handle})
--   the money     → ledger + balance_cents, already withdrawable via payouts
--   the 30 days   → the mozg_src first-touch cookie in middleware.ts
--
-- What was missing is here: who brought whom, and how many people opened the
-- link without signing up.

-- ─── who brought whom ───────────────────────────────────────────────────────
--
-- Not signup_source. That column holds free text — 'direct', 'google.com',
-- whatever utm_source said — and a handle is free text too, so reading a
-- referral out of it would hand every direct-arriving account to whoever
-- registered the handle "direct". The referrer is a user, so store a user.
--
-- set null, not cascade: a deleted referrer must not delete the person they
-- brought. The commission simply stops.
alter table "user" add column if not exists referred_by text
  references "user"(id) on delete set null;

create index if not exists user_referred_by_idx on "user" (referred_by)
  where referred_by is not null;

comment on column "user".referred_by is
  'The account whose /r/{handle} link brought this one, read off the mozg_ref '
  'cookie at signup. Never self. Set once, at creation, and never rewritten: '
  'first touch is what deserves the credit.';

-- ─── clicks ─────────────────────────────────────────────────────────────────
--
-- Without this an affiliate sees signups and nothing else, which makes a link
-- that is working and a link nobody has posted look identical — and they need
-- opposite responses.
--
-- One row per visitor per day per link, primary key enforced, insert with
-- on conflict do nothing. A daily grain rather than every hit because the
-- number is there to answer "is anyone opening this", and counting one
-- person's twelve refreshes as twelve clicks answers it wrongly.
--
-- `visitor` is a salted hash of IP and user agent, truncated (lib/referral.ts).
-- It cannot be reversed into a person and is not joined to anything; it exists
-- only so today's second visit is recognised as the same visit.
create table if not exists referral_clicks (
  referrer_id text not null references "user"(id) on delete cascade,
  day         date not null,
  visitor     text not null,
  at          timestamptz not null default now(),
  primary key (referrer_id, day, visitor)
);

create index if not exists referral_clicks_day_idx on referral_clicks (referrer_id, day desc);

-- ─── the money ──────────────────────────────────────────────────────────────
--
-- Its own ledger kind rather than reusing 'earning'. A referral commission and
-- a brain sale are both money arriving, but only one of them is answered by
-- "make a better brain" — and the balance page names the kind, so folding them
-- together would leave an affiliate reading "Sale" for a payment they made no
-- sale to earn.
alter table ledger drop constraint if exists ledger_kind_check;
alter table ledger add constraint ledger_kind_check
  check (kind in ('topup', 'purchase', 'earning', 'payout', 'refund',
                  'adjustment', 'plan', 'generation', 'referral'));
