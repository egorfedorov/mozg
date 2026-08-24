-- ═══════════════════════════════════════════════════════════════════════════
-- 0090 — repository sources
--
-- A source of kind 'repo' is a crawl root like 'site', pointed at a code
-- repository rather than a documentation set. Same expansion into url sources,
-- same recrawl, different question: a docs crawl asks "what does this product
-- do", a repo crawl asks "how does THIS codebase do it" — the conventions,
-- the layout and the local decisions that no published documentation contains
-- and no training set can hold.
--
-- Kept as a kind rather than a flag because every path that branches on how a
-- source was gathered already branches on `kind`, and a second dimension for
-- one bit would have to be threaded through all of them.
-- ═══════════════════════════════════════════════════════════════════════════

alter table sources drop constraint if exists sources_kind_check;
alter table sources add constraint sources_kind_check
  check (kind in ('image', 'text', 'url', 'file', 'site', 'repo'));
