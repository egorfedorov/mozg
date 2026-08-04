-- ═══════════════════════════════════════════════════════════════════════════
-- 0022 — buyer reviews
--
-- Only people who paid may speak: a review row references the buyer, and the
-- write path verifies a purchase that satisfies the brain's gate. One review
-- per buyer per brain, editable — an updated opinion replaces the old one
-- rather than piling on.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists reviews (
  id         uuid primary key default gen_random_uuid(),
  brain_id   uuid not null references brains(id) on delete cascade,
  buyer_id   text not null references "user"(id) on delete cascade,
  rating     int not null check (rating between 1 and 5),
  body       text not null default '',
  created_at timestamptz not null default now(),
  unique (brain_id, buyer_id)
);

create index if not exists reviews_brain_idx on reviews (brain_id, created_at desc);
