-- 0089 — gen projects are not only slots
--
-- kind was ('slot', 'other'), which is a column that has already decided the
-- service does one thing. It does not: the storefront tile spec Stake publishes
-- applies to every game it lists, whatever the genre, and the split-layer rules
-- in lib/slotgen.ts are correct for a card game or a crash game exactly as they
-- are for a slot.
--
-- Three kinds rather than a taxonomy invented in advance:
--
--   slot     the value ladder and the set that goes with it
--   tiles    a storefront listing: one cut-out hero and the two backgrounds it
--            sits on, portrait and landscape. Any game.
--   custom   an empty project. You name the assets and pick their roles.
--
-- `custom` is the honest answer to "what about everything else". A category
-- with no rules behind it would be a promise the prompts cannot keep, and the
-- one thing this service is actually selling is that it knows what a set needs.
-- An empty plan says "you know, we do not" without pretending otherwise.
alter table gen_projects drop constraint if exists gen_projects_kind_check;
alter table gen_projects add constraint gen_projects_kind_check
  check (kind in ('slot', 'tiles', 'custom', 'other'));

comment on column gen_projects.kind is
  'What is being made: slot (the paytable set), tiles (a storefront listing for '
  'any game), custom (an empty plan you fill yourself). ''other'' is the value '
  'projects created before this existed carry.';
