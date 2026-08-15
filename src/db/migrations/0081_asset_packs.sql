-- 0081 — asset packs: a brief, and the set of game-ready assets it produced
--
-- gen.mozg.sh generates art for slot games, and the unit of work there is not
-- one picture. A symbol that looks right alone and wrong beside the other
-- eleven is a symbol nobody can ship, so the brief — theme, mood, palette — is
-- stored once and every asset in the set is generated against it. That shared
-- row is the whole reason this table exists rather than a `brief` column
-- repeated on each generation.
--
-- Assets themselves stay in `generations`: it already debits the buyer inside
-- the transaction that creates the row, refunds on failure, pays an artist
-- when there is one, and carries the storage key. A second table shaped like
-- it would be a second set of those rules to keep in step.
create table if not exists asset_packs (
  id             uuid primary key default gen_random_uuid(),
  owner_id       text not null references "user"(id) on delete cascade,

  title          text not null,
  -- What the studio asked for, in their words. Compiled into every asset's
  -- prompt, and kept verbatim so a pack can be re-run when a model improves.
  brief          text not null,
  -- Hex values the whole set shares. Free text rather than an array: a brief
  -- says "warm gold #E8B04B, deep violet" as often as it says three hexes,
  -- and forcing that into a column loses what the studio actually meant.
  palette        text,

  -- Optional: generate in a bought artist's style rather than from the brief
  -- alone. When set, every asset in the pack pays that artist per image, the
  -- same deal the gallery already runs on.
  style_brain_id uuid references brains(id) on delete set null,

  created_at     timestamptz not null default now()
);

create index if not exists asset_packs_owner_idx
  on asset_packs (owner_id, created_at desc);

-- An asset belongs to a pack, and knows what it is for. `role` drives the
-- prompt preset (a symbol is cut out on flat chroma, a background is not) and
-- the export name; `label` is the studio's own word for it — "wild",
-- "scatter", "low-10" — which is what the file has to be called when it
-- reaches the engine.
alter table generations add column if not exists pack_id uuid
  references asset_packs(id) on delete cascade;
alter table generations add column if not exists role text;
alter table generations add column if not exists label text;

create index if not exists generations_pack_idx
  on generations (pack_id, created_at);

-- A pack generated from a brief alone has no artist to pay, so the two
-- columns that always named one become optional. Every existing row has both,
-- and the gallery path still writes both — this only makes room for the case
-- where nobody is owed anything.
alter table generations alter column brain_id drop not null;
alter table generations alter column artist_id drop not null;
