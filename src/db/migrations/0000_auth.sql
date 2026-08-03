-- ═══════════════════════════════════════════════════════════════════════════
-- 0000 — identity tables (better-auth schema)
--
-- These are better-auth's own tables. They used to be created by
-- `npx @better-auth/cli migrate`, which works on a developer machine and
-- silently does nothing inside a container — no output, no error, no tables.
-- Deployment should not hinge on an interactive CLI, so the schema lives here
-- as an ordinary migration.
--
-- Generated from a database the CLI had migrated, so it matches exactly. The
-- camelCase column names are better-auth's convention, not ours; quoting is
-- mandatory. Pinned against better-auth 1.4.x — re-dump after a major bump.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists "user" (
  id              text primary key,
  name            text not null,
  email           text not null unique,
  "emailVerified" boolean not null default false,
  image           text,
  "createdAt"     timestamptz not null default current_timestamp,
  "updatedAt"     timestamptz not null default current_timestamp
);

create table if not exists session (
  id          text primary key,
  "expiresAt" timestamptz not null,
  token       text not null unique,
  "createdAt" timestamptz not null default current_timestamp,
  "updatedAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text,
  "userId"    text not null references "user"(id) on delete cascade
);

create index if not exists "session_userId_idx" on session ("userId");

create table if not exists account (
  id                       text primary key,
  "accountId"              text not null,
  "providerId"             text not null,
  "userId"                 text not null references "user"(id) on delete cascade,
  "accessToken"            text,
  "refreshToken"           text,
  "idToken"                text,
  "accessTokenExpiresAt"   timestamptz,
  "refreshTokenExpiresAt"  timestamptz,
  scope                    text,
  password                 text,
  "createdAt"              timestamptz not null default current_timestamp,
  "updatedAt"              timestamptz not null
);

create index if not exists "account_userId_idx" on account ("userId");

create table if not exists verification (
  id          text primary key,
  identifier  text not null,
  value       text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default current_timestamp,
  "updatedAt" timestamptz not null default current_timestamp
);

create index if not exists verification_identifier_idx on verification (identifier);
