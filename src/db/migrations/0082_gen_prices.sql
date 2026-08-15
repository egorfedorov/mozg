-- 0082 — what an asset costs, as a setting rather than a constant
--
-- The gallery has one price for one picture and that was right for it: a
-- buyer comparing two styles should compare the work, not the tariff. A studio
-- ordering a set is a different trade — a lobby tile and a low-pay trinket cost
-- the same to generate and are worth wildly different amounts — so the price
-- belongs to the role, and to whoever runs the service rather than to whoever
-- last edited a TypeScript file.
--
-- Seeded with the number the gallery already charges, so nothing changes price
-- the moment this lands. Rows are the roles lib/slotgen knows; a role missing
-- here falls back in code rather than blocking a generation.
create table if not exists gen_prices (
  role       text primary key,
  cents      int  not null check (cents >= 0),
  updated_at timestamptz not null default now()
);

insert into gen_prices (role, cents) values
  ('symbol', 25),
  ('background', 25),
  ('tile', 25),
  ('frame', 25)
on conflict (role) do nothing;
