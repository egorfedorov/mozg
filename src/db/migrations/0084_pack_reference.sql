-- 0084 — one asset becomes the reference the rest are drawn against
--
-- Eleven symbols generated from the same sentence are eleven interpretations
-- of that sentence: the light flips, the outline weight drifts, the gold in
-- one is the gold of a different game. A studio cannot ship that, and no
-- amount of prompt wording fixes it — the model has no memory between calls.
--
-- What does fix it is a picture. The provider accepts reference images, so the
-- set is generated in two stages: one anchor asset first, then every other
-- asset with that anchor attached as the reference. This is the studio's own
-- "per-part i2i" method — each part drawn alone, fully, against one reference
-- so the parts match.
--
-- Two columns are all it takes: which row is the anchor, and where its picture
-- ended up once it existed.
alter table generations add column if not exists is_anchor boolean not null default false;
alter table asset_packs add column if not exists reference_key text;

-- The worker looks up "the anchor of this pack" on every asset it finishes.
create index if not exists generations_anchor_idx
  on generations (pack_id) where is_anchor;
