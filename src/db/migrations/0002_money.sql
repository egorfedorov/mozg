-- ═══════════════════════════════════════════════════════════════════════════
-- 0002 — balance, ledger and brain purchases
--
-- Everything is integer cents. No floats anywhere near money: 0.1 + 0.2 is a
-- rounding error in a spreadsheet and a support ticket in a product.
--
-- The ledger is the source of truth and is append-only. "user".balance_cents
-- is a cache of its sum, written in the same transaction, so a balance can be
-- read without aggregating history — and disagreement between the two is
-- detectable (scripts/check-money.ts).
-- ═══════════════════════════════════════════════════════════════════════════

alter table "user" add column if not exists balance_cents int not null default 0;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_balance_nonneg') then
    -- A balance can never go negative. If a code path ever tries, the
    -- transaction dies here rather than quietly lending someone money.
    alter table "user" add constraint user_balance_nonneg check (balance_cents >= 0);
  end if;
end $$;

-- ─── price on a brain ───────────────────────────────────────────────────────

alter table brains add column if not exists price_cents int not null default 0;
alter table brains add column if not exists sales_count int not null default 0;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'brains_price_sane') then
    -- Zero means free. The ceiling is a guard against a slipped decimal point
    -- turning $5 into $500 in a form post.
    alter table brains add constraint brains_price_sane
      check (price_cents >= 0 and price_cents <= 100000);
  end if;
end $$;

-- ─── ledger ─────────────────────────────────────────────────────────────────

create table if not exists ledger (
  id           bigserial primary key,
  user_id      text not null references "user"(id) on delete cascade,
  -- Signed: positive credits the user, negative debits them. One row per
  -- movement, so a purchase writes two rows — the buyer's debit and the
  -- author's earning — and they must sum to the platform's cut.
  amount_cents int not null check (amount_cents <> 0),
  kind         text not null check (kind in
                 ('topup', 'purchase', 'earning', 'payout', 'refund', 'adjustment')),
  brain_id     uuid references brains(id) on delete set null,
  purchase_id  uuid,
  -- Set by a payment provider so the same top-up can never be credited twice.
  external_ref text,
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists ledger_user_idx on ledger (user_id, created_at desc);
create unique index if not exists ledger_external_ref_key on ledger (external_ref)
  where external_ref is not null;

-- ─── purchases ──────────────────────────────────────────────────────────────

create table if not exists purchases (
  id           uuid primary key default gen_random_uuid(),
  brain_id     uuid not null references brains(id) on delete cascade,
  buyer_id     text not null references "user"(id) on delete cascade,
  seller_id    text not null references "user"(id) on delete cascade,
  -- Recorded as paid, not as the brain's price today: the author may change
  -- the price later and the receipt must not change with it.
  price_cents  int not null check (price_cents > 0),
  seller_cents int not null check (seller_cents >= 0),
  created_at   timestamptz not null default now(),
  -- Access is bought once. This also makes the purchase idempotent under
  -- concurrent clicks: the second insert fails instead of charging twice.
  unique (brain_id, buyer_id)
);

create index if not exists purchases_buyer_idx on purchases (buyer_id, created_at desc);
create index if not exists purchases_seller_idx on purchases (seller_id, created_at desc);

-- ─── keep the sales counter honest ──────────────────────────────────────────

create or replace function bump_sales_count() returns trigger
language plpgsql as $$
begin
  update brains set sales_count = (
    select count(*)::int from purchases p where p.brain_id = coalesce(new.brain_id, old.brain_id)
  ) where id = coalesce(new.brain_id, old.brain_id);
  return null;
end $$;

drop trigger if exists purchases_count_trg on purchases;
create trigger purchases_count_trg after insert or delete on purchases
  for each row execute function bump_sales_count();
