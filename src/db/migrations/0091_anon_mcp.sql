-- ═══════════════════════════════════════════════════════════════════════════
-- 0091 — anonymous MCP callers
--
-- A second door on the MCP surface (/mcp/public) answers without a token, so
-- an agent can search the free public catalogue before anyone signs up. The
-- steps between "I heard about this" and "it answered a question" were the
-- product's real ceiling: register, issue a token, export it, learn the tool
-- names. This removes all four for the read-only case.
--
-- Two things the schema has to provide for it.
--
-- calls.caller_id is `not null references "user"(id)`, and rightly so — every
-- quota, every metering query and the whole usage loop run off it. Rather than
-- weaken that, anonymous traffic is metered against ONE real row, the 'anon'
-- user, on the free plan. It owns nothing and has bought nothing, so the
-- existing paywall already answers "what may it read" with no special case:
-- exactly the free public catalogue.
--
-- But one row means one caller, and two mechanisms need to tell anonymous
-- callers apart. The burst limit has to be per person, or the first agent in a
-- retry loop closes the door for everybody. And the search-gap harvest only
-- promotes a miss to an exam question once TWO different people have hit it —
-- with a shared id, anonymous misses would look like one very persistent
-- person forever and never teach the brain anything. So calls carries a salted
-- hash of the caller's IP: enough to separate people and rate-limit them,
-- never the address itself.
-- ═══════════════════════════════════════════════════════════════════════════

alter table calls add column if not exists caller_ip_hash text;

-- The rate-limit lookup: "how many calls from this hash in the last minute".
create index if not exists calls_ip_recent_idx
  on calls (caller_ip_hash, created_at desc)
  where caller_ip_hash is not null;

-- The singleton anonymous caller. A real row so the foreign key holds; a
-- deliberately unusable email so nobody can sign in as it.
insert into "user" (id, name, email, "emailVerified")
values ('anon', 'Anonymous', 'anon@invalid.mozg.sh', false)
on conflict (id) do nothing;
