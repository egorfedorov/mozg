-- ═══════════════════════════════════════════════════════════════════════════
-- 0016 — whole-site sources
--
-- A source of kind 'site' is a crawl root: one URL the owner pasted, expanded
-- by the crawl worker into individual url sources (GitHub tree, sitemap, or a
-- link walk). The row itself never produces notes — it records what was asked
-- for and how the discovery went.
-- ═══════════════════════════════════════════════════════════════════════════

alter table sources drop constraint if exists sources_kind_check;
alter table sources add constraint sources_kind_check
  check (kind in ('image', 'text', 'url', 'file', 'site'));
