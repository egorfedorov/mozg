import { notFound } from "next/navigation";
import { query } from "@/db";
import { env } from "@/lib/env";
import { currentUser, type SessionUser } from "@/lib/session";
import { embedHealthy } from "@/lib/embed";
import type { Plan, Visibility } from "@/db/types";

/**
 * The operator's view. Everything here reads or writes other people's data, so
 * every entry point calls requireAdmin() again — a page guard is not a
 * substitute for a guard on the action it renders.
 */

const ADMINS = new Set(
  env.ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

export function isAdmin(user: SessionUser | null): boolean {
  return !!user && ADMINS.has(user.email.toLowerCase());
}

/**
 * Admin or nothing. 404, not 403: a stranger should not learn that /admin
 * exists, and a signed-in user should not learn they are one permission away
 * from it.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await currentUser();
  if (!isAdmin(user)) notFound();
  return user!;
}

/* ─── health ─────────────────────────────────────────────────────────────── */

export interface Health {
  database: boolean;
  embeddings: boolean;
  /** Sources that have been "processing" for over an hour: a dead worker. */
  stuck: number;
  pending: number;
  /** MCP calls in the last 5 minutes — is anything actually connected? */
  callsLive: number;
  callsDay: number;
  failuresDay: number;
}

export async function health(): Promise<Health> {
  const dbOk = await query("select 1").then(
    () => true,
    () => false,
  );

  const embeddings = await embedHealthy();
  if (!dbOk) {
    return {
      database: false,
      embeddings,
      stuck: 0,
      pending: 0,
      callsLive: 0,
      callsDay: 0,
      failuresDay: 0,
    };
  }

  const rows = await query<Omit<Health, "database" | "embeddings">>(
    `select
       (select count(*) filter (where status = 'processing'
          and created_at < now() - interval '1 hour')::int from sources) as stuck,
       (select count(*) filter (where status in ('queued','processing'))::int
          from sources) as pending,
       (select count(*)::int from calls
          where created_at > now() - interval '5 minutes') as "callsLive",
       (select count(*)::int from calls
          where created_at > now() - interval '24 hours') as "callsDay",
       (select count(*)::int from calls
          where created_at > now() - interval '24 hours' and not ok) as "failuresDay"`,
  );

  return { database: true, embeddings, ...rows[0] };
}

/* ─── people ─────────────────────────────────────────────────────────────── */

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  handle: string | null;
  plan: Plan;
  email_verified: boolean;
  balance_cents: number;
  brains: number;
  notes: number;
  tokens: number;
  calls_week: number;
  /** Null when this user has never made an MCP call. */
  last_call: string | null;
  created_at: string;
}

export async function adminUsers(limit = 200): Promise<AdminUser[]> {
  return query<AdminUser>(
    `select u.id, u.email, u.name, u.handle, u.plan,
            u."emailVerified" as email_verified, u.balance_cents,
            (select count(*)::int from brains b where b.owner_id = u.id) as brains,
            (select coalesce(sum(note_count), 0)::int from brains b
              where b.owner_id = u.id) as notes,
            (select count(*)::int from mcp_tokens t
              where t.user_id = u.id and t.revoked_at is null) as tokens,
            (select count(*)::int from calls c
              where c.caller_id = u.id
                and c.created_at > now() - interval '7 days') as calls_week,
            to_char((select max(created_at) from calls c where c.caller_id = u.id)
                      at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as last_call,
            to_char(u."createdAt" at time zone 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
       from "user" u
      order by u."createdAt" desc
      limit $1`,
    [limit],
  );
}

/* ─── brains ─────────────────────────────────────────────────────────────── */

export interface AdminBrain {
  id: string;
  slug: string;
  title: string;
  topic: string;
  visibility: Visibility;
  price_cents: number;
  sales_count: number;
  note_count: number;
  source_count: number;
  score: number | null;
  owner_id: string;
  owner_email: string;
  owner_handle: string | null;
  failed_sources: number;
  updated_at: string;
}

export async function adminBrains(limit = 200): Promise<AdminBrain[]> {
  return query<AdminBrain>(
    `select b.id, b.slug, b.title, b.topic, b.visibility, b.price_cents, b.sales_count,
            b.note_count, b.source_count, b.score,
            u.id as owner_id, u.email as owner_email, u.handle as owner_handle,
            (select count(*)::int from sources s
              where s.brain_id = b.id and s.status in ('failed','rejected'))
              as failed_sources,
            to_char(b.updated_at at time zone 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
       from brains b join "user" u on u.id = b.owner_id
      order by b.updated_at desc
      limit $1`,
    [limit],
  );
}

/* ─── money ──────────────────────────────────────────────────────────────── */

export interface AdminMoney {
  topped_up: number;
  spent: number;
  to_authors: number;
  platform_cut: number;
  outstanding: number;
  purchases: number;
}

/**
 * The ledger, not the balances. `outstanding` is what users are holding and we
 * therefore owe — the number that matters if anyone ever asks for a payout.
 */
export async function adminMoney(): Promise<AdminMoney> {
  const rows = await query<AdminMoney>(
    `select
       coalesce(sum(amount_cents) filter (where kind = 'topup'), 0)::int as topped_up,
       coalesce(-sum(amount_cents) filter (where kind = 'purchase'), 0)::int as spent,
       coalesce(sum(amount_cents) filter (where kind = 'earning'), 0)::int as to_authors,
       coalesce(-sum(amount_cents) filter (where kind = 'purchase'), 0)::int
         - coalesce(sum(amount_cents) filter (where kind = 'earning'), 0)::int
         as platform_cut,
       (select coalesce(sum(balance_cents), 0)::int from "user") as outstanding,
       (select count(*)::int from purchases) as purchases
     from ledger`,
  );
  return rows[0];
}

export interface AdminPayout {
  id: string;
  email: string;
  handle: string | null;
  amount_cents: number;
  balance_cents: number;
  destination: string;
  requested_at: string;
}

/** Withdrawals waiting on a human to send crypto and mark them paid. */
export async function openPayouts(): Promise<AdminPayout[]> {
  return query<AdminPayout>(
    `select p.id::text, u.email, u.handle, p.amount_cents, u.balance_cents,
            p.destination,
            to_char(p.requested_at at time zone 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS"Z"') as requested_at
       from payouts p join "user" u on u.id = p.user_id
      where p.status = 'requested'
      order by p.requested_at`,
  );
}

export interface AdminLedgerRow {
  id: string;
  email: string;
  amount_cents: number;
  kind: string;
  note: string | null;
  brain_title: string | null;
  created_at: string;
}

export async function adminLedger(limit = 25): Promise<AdminLedgerRow[]> {
  return query<AdminLedgerRow>(
    `select l.id::text, u.email, l.amount_cents, l.kind, l.note,
            b.title as brain_title,
            to_char(l.created_at at time zone 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
       from ledger l
       join "user" u on u.id = l.user_id
       left join brains b on b.id = l.brain_id
      order by l.id desc limit $1`,
    [limit],
  );
}
