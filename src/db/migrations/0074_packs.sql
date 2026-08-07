-- ═══════════════════════════════════════════════════════════════════════════
-- 0074 — a pack is bought once, and shared
--
-- 0073 modelled seats as a property of a subscription tier: a `studio` plan
-- that carried five of them, and a shared monthly allowance underneath. That
-- was the wrong shape twice over.
--
-- Wrong about the object. What a team actually buys is a pack — the eight or
-- twelve brains their trade spans — and they buy it once. Renting it monthly
-- prices a thing that does not expire, and nobody wants a subscription to a
-- book they have already read.
--
-- Wrong about the allowance. Sharing a purchase should not share a quota:
-- plans are what they always were — how much of our reading you get and how
-- many calls you may make — and a colleague who hits their own ceiling should
-- go and buy pro, not silently eat the buyer's month. That is a funnel; the
-- shared bucket was the opposite of one.
--
-- So the tier goes, the shared bucket goes, and seats hang off the purchase
-- they belong to. Nobody had bought `studio` and no seat had been given, so
-- this drops rather than migrates.
-- ═══════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';

-- ─── the purchase ───────────────────────────────────────────────────────────
--
-- Not a row in `purchases`: that table is the per-brain marketplace, with a
-- seller and a revenue split, and a pack spans two families and five loose
-- brains with no single brain to hang it on. A pack is named by its slug in
-- src/lib/packs.ts — deliberately not a foreign key, because a pack is an
-- editorial grouping and its membership changes without the receipt changing.
create table if not exists pack_purchases (
  id          uuid primary key default gen_random_uuid(),
  pack        text not null,
  buyer_id    text not null references "user"(id) on delete cascade,
  -- What was actually paid, kept on the row: a price that changes later must
  -- not rewrite what somebody's receipt says.
  price_cents int not null check (price_cents >= 0),
  created_at  timestamptz not null default now(),
  unique (pack, buyer_id)
);

create index if not exists pack_purchases_buyer_idx on pack_purchases (buyer_id);

-- ─── the seats on it ────────────────────────────────────────────────────────
--
-- Bound to (pack, buyer): the seat is on that purchase, so it dies with it and
-- cannot be lent across two packs. Matched on a verified email, the rule every
-- other invitation in this schema uses — without it, signing up as
-- someone@their-studio.com collects the studio.
create table if not exists pack_seats (
  id         uuid primary key default gen_random_uuid(),
  pack       text not null,
  buyer_id   text not null references "user"(id) on delete cascade,
  email      citext not null,
  invited_at timestamptz not null default now(),
  unique (pack, buyer_id, email),
  foreign key (pack, buyer_id) references pack_purchases (pack, buyer_id) on delete cascade
);

create index if not exists pack_seats_email_idx on pack_seats (email);

-- ─── undo 0073 ──────────────────────────────────────────────────────────────

drop table if exists members;

-- billed_to existed only to point a colleague's call at somebody else's month.
-- With the allowance back on the caller it is always caller_id, and a column
-- that can only ever repeat its neighbour is a column that will one day
-- disagree with it.
drop index if exists calls_billed_month_idx;
alter table calls drop column if exists billed_to;
