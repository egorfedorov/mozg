-- ═══════════════════════════════════════════════════════════════════════════
-- 0024 — mozgpay: taking crypto without a middleman
--
-- An invoice is our own row and a unique amount fingerprint (19.0042 USDT):
-- the watcher reads the chain, matches an incoming transfer to the one
-- pending invoice with that exact amount, and settles through the same
-- ledger path the gateway used. Keys never touch the server — the address
-- is the owner's wallet, the server can only watch it.
-- ═══════════════════════════════════════════════════════════════════════════

alter table topups add column if not exists chain text;
alter table topups add column if not exists pay_address text;
-- Numeric, not cents: token amounts carry the fingerprint in their decimals.
alter table topups add column if not exists pay_amount numeric(18, 6);
alter table topups add column if not exists expires_at timestamptz;

-- The fingerprint only disambiguates while invoices are pending — two paid
-- invoices may share an amount, two open ones on one address must not.
create unique index if not exists topups_open_fingerprint
  on topups (pay_address, pay_amount)
  where status = 'pending' and pay_amount is not null;
