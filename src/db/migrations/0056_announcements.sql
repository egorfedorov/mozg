-- 0056 — announcements: telling people something is happening
--
-- Two things were invisible. A deploy that restarts the worker mid-ingest looks
-- to a user like their brain stopped learning, and there was no way to say
-- "twenty minutes, then it resumes". And news — a feature that shipped, a
-- catalogue pack worth trying — reached only whoever re-read /changelog.
--
-- One table for both, because they differ in tone and lifetime, not in
-- mechanism: a banner while it is live, an entry afterwards.

create table if not exists announcements (
  id         uuid primary key default gen_random_uuid(),
  -- maintenance: something is degraded or restarting right now.
  -- news: something shipped and is worth reading about.
  -- notice: everything else worth one line at the top of the page.
  kind       text not null check (kind in ('maintenance', 'news', 'notice')),
  title      text not null,
  body       text not null default '',
  -- The banner window. starts_at defaults to now so posting is one field;
  -- ends_at null means "until it is unpublished by hand", which is right for
  -- news and wrong for maintenance — the admin form fills it in.
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  published  boolean not null default true,
  -- Agents read the MCP surface, not the website. A maintenance notice belongs
  -- in brain_list; a news item usually does not, so it is a choice per entry.
  to_agents  boolean not null default false,
  created_by text references "user"(id) on delete set null,
  created_at timestamptz not null default now()
);

-- The banner query: published, inside its window, newest first.
create index if not exists announcements_live_idx
  on announcements (starts_at desc)
  where published;
