-- 0083 — remember which key a pack was generated on
--
-- The key colour is chosen per pack, against the brief: a magenta jellyfish
-- cannot be keyed on magenta, and the one unrecoverable failure in this whole
-- pipeline is keying out the subject. Which means the worker cannot assume a
-- colour when it cuts — it has to cut on the same key the prompt asked for.
--
-- Stored on the pack rather than derived again at cut time, because deriving
-- it twice from free text is two chances to disagree, and the disagreement
-- shows up as a symbol with a hole in it.
--
-- Existing rows predate the choice and were all generated on green.
alter table asset_packs add column if not exists chroma text not null default 'magenta';
update asset_packs set chroma = 'green' where created_at < now() and chroma = 'magenta';
