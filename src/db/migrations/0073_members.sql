-- ═══════════════════════════════════════════════════════════════════════════
-- 0073 — a studio is people, not ceilings
--
-- The team plan's own comment admitted what it was: "seats and shared
-- ownership are not built yet, so this is higher ceilings, not a team
-- product." Selling it to a studio meant selling one account and asking five
-- people to share a password, or inviting each colleague to each brain by
-- hand — twelve invitations per person, and a thirteenth the day a brain is
-- added.
--
-- A member is invited to the studio, not to a brain: everything the owner has
-- now, and everything the owner makes later. Invitations are by email, matched
-- on a VERIFIED address for the same reason grants are — otherwise signing up
-- as someone@their-studio.com collects the studio.
-- ═══════════════════════════════════════════════════════════════════════════

-- Fail rather than queue. Adding a column takes ACCESS EXCLUSIVE on `calls`,
-- and a request for that lock parks behind whatever SELECT is already running
-- — while every reader that arrives after it parks behind the request. A
-- dashboard aggregate held that read lock for two and a half minutes during
-- the rehearsal of this migration, which would have been two and a half
-- minutes of an unreadable `calls` table on a live site. Three seconds, then
-- the migration errors, the deploy stops before the swap, and re-running it is
-- safe — everything below is idempotent. (scripts/migrate.ts wraps each file
-- in a transaction, which is what makes `set local` the right scope.)
set local lock_timeout = '3s';

create table if not exists members (
  id          uuid primary key default gen_random_uuid(),
  -- Whose studio. The owner's plan is the one the seat is charged against.
  owner_id    text not null references "user"(id) on delete cascade,
  email       citext not null,
  -- The same two roles grants use, and they mean the same thing: a viewer
  -- reads, a contributor's agent may also propose notes. Nobody but the owner
  -- can price, publish, delete, or invite.
  role        text not null default 'contributor' check (role in ('viewer', 'contributor')),
  accepted_by text references "user"(id) on delete set null,
  invited_by  text not null references "user"(id) on delete cascade,
  invited_at  timestamptz not null default now(),
  unique (owner_id, email)
);

create index if not exists members_email_idx on members (email);

-- ─── the shared allowance ───────────────────────────────────────────────────
--
-- Quota was counted by caller_id, which is right for one person and wrong for
-- a studio: five colleagues on a shared plan each got their own free-account
-- allowance, so what the studio paid for bore no relation to what it could
-- spend. Now every call names the account it is charged to — the caller
-- normally, the studio when the caller is one of its members.
--
-- A column rather than a join at read time: the quota check runs on every
-- single MCP call, before the tool does anything, and it must not first ask
-- who this caller works for.
alter table calls add column if not exists billed_to text
  references "user"(id) on delete set null;

-- Backfill: every call so far was charged to whoever made it, which is what
-- the old count meant. Without this the first quota check after deploy reads
-- an empty month and hands every account its allowance twice.
update calls set billed_to = caller_id where billed_to is null;

create index if not exists calls_billed_month_idx on calls (billed_to, created_at desc);
