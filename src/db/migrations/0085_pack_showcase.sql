-- 0085 — packs the storefront is allowed to show
--
-- A studio's brief and its art are private: the export route scopes to the
-- owner and the image route to the buyer, deliberately. But a service selling
-- generated art with no generated art on its front page is asking to be taken
-- on trust, and nobody does.
--
-- So: an explicit flag, off by default, set by hand on packs we made ourselves
-- for exactly this purpose. Not a visibility level with rules to reason about
-- — one boolean, and the only thing that reads it is the storefront and the
-- image route's public branch.
alter table asset_packs add column if not exists showcase boolean not null default false;

create index if not exists asset_packs_showcase_idx on asset_packs (created_at desc)
  where showcase;
