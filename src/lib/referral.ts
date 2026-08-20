import { createHash } from "node:crypto";
import { query } from "@/db";
import type { PoolClient } from "pg";
import { move } from "@/lib/money";
import { PLAN_PRICE_CENTS, type PaidPlan } from "@/lib/plans";
import { REFERRAL_PERCENT, commissionCents } from "@/lib/money-math";
import { env } from "@/lib/env";

export { REFERRAL_PERCENT, commissionCents } from "@/lib/money-math";

/**
 * Earn with mozg — one referral, paid every month it renews.
 *
 * The whole programme in four facts:
 *
 *   the link      mozg.sh/r/{handle} — the handle you already have
 *   the window    30 days, in a cookie, first touch wins
 *   the money     20% of every plan payment, on your balance the same second
 *   the end       when they stop paying, and not before
 *
 * Deliberately not an integration with an affiliate platform. mozg already has
 * a ledger, a balance and a payout queue; posting a commission into them is one
 * `move()` inside a transaction that is already open, and it settles instantly
 * instead of on somebody else's 30-day cycle. A third party here would add a
 * webhook, a reconciliation problem and a second definition of what a referral
 * is, in exchange for nothing this file does not already do.
 */

/** How long a click is remembered. Matches the first-touch source cookie. */
export const REFERRAL_DAYS = 30;

/**
 * Set by /r/{handle}, read once by the signup hook.
 *
 * Separate from mozg_src even though both hold a first touch: that one is a
 * free-text origin for our own reporting and may be anything, this one is a
 * claim on money and must be a handle we resolved against the table before
 * writing it.
 */
export const REFERRAL_COOKIE = "mozg_ref";

/** The link an affiliate shares. Short on purpose: it goes in a bio. */
export function referralLink(handle: string): string {
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/r/${handle}`;
}

/**
 * Today's identity for one visitor of one link.
 *
 * A salted hash, truncated to 16 hex characters, with the day mixed in — so it
 * cannot be reversed to an address, cannot be matched against yesterday's, and
 * cannot follow anybody between two affiliates' links. It exists for exactly
 * one purpose: recognising a refresh as the same visit.
 */
export function visitorKey(ip: string, ua: string, day: string): string {
  const salt = env.BETTER_AUTH_SECRET ?? "mozg-referral";
  return createHash("sha256").update(`${salt}:${day}:${ip}:${ua}`).digest("hex").slice(0, 16);
}

/** UTC date, the grain clicks are counted at. */
export function today(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Count an open of somebody's link. Best effort by design — the redirect is
 * the point, and a click that failed to record must never cost a visitor.
 */
export async function recordClick(referrerId: string, visitor: string, day: string): Promise<void> {
  try {
    await query(
      `insert into referral_clicks (referrer_id, day, visitor)
       values ($1, $2, $3) on conflict do nothing`,
      [referrerId, day, visitor],
    );
  } catch {
    // A dead pool or a stale deploy without the table. Neither is worth a 500
    // on a link somebody just posted publicly.
  }
}

/**
 * Pay the referrer of `payerId`, if there is one.
 *
 * Runs inside the caller's transaction — the plan purchase and the commission
 * commit together or not at all, which is the only arrangement where the
 * ledger can be trusted to sum to zero against the platform's cut.
 *
 * Returns what was paid so the caller can log it; zero when there is no
 * referrer, which is the common case and not an error.
 */
export async function payReferralCommission(
  client: PoolClient,
  opts: { payerId: string; paidCents: number; note: string },
): Promise<number> {
  if (opts.paidCents <= 0) return 0;

  const { rows } = await client.query<{ referred_by: string | null; handle: string | null }>(
    `select referred_by, handle from "user" where id = $1`,
    [opts.payerId],
  );
  const referrer = rows[0]?.referred_by;
  // Self-referral is blocked at signup, but a bad row is cheaper to survive
  // than to audit later.
  if (!referrer || referrer === opts.payerId) return 0;

  const cents = commissionCents(opts.paidCents);
  if (cents <= 0) return 0;

  await move({
    client,
    userId: referrer,
    amountCents: cents,
    kind: "referral",
    note: `${REFERRAL_PERCENT}% of ${opts.note} · ${rows[0]?.handle ?? "a referral"}`,
  });
  return cents;
}

export interface ReferralStats {
  /** Opens of the link, one per visitor per day. */
  clicks: number;
  clicks30d: number;
  /** Accounts that signed up through it. */
  signups: number;
  /** Of those, how many are on a live paid plan right now. */
  paying: number;
  /** Everything this link has ever earned. */
  earnedCents: number;
  /** Earned in the last 30 days. */
  earned30dCents: number;
  /**
   * What the current referrals pay per month if none of them leave. A
   * projection, and labelled as one wherever it is shown — the other numbers
   * on this object are money that already moved.
   */
  runRateCents: number;
}

export async function referralStats(userId: string): Promise<ReferralStats> {
  const [clicks, people, earned, active] = await Promise.all([
    query<{ all: number; recent: number }>(
      `select count(*)::int as all,
              count(*) filter (where day > current_date - 30)::int as recent
         from referral_clicks where referrer_id = $1`,
      [userId],
    ),
    query<{ signups: number; paying: number }>(
      `select count(*)::int as signups,
              count(*) filter (
                where plan in ('pro', 'team') and paid_until is not null and paid_until > now()
              )::int as paying
         from "user" where referred_by = $1`,
      [userId],
    ),
    query<{ all: number; recent: number }>(
      `select coalesce(sum(amount_cents), 0)::int as all,
              coalesce(sum(amount_cents) filter (
                where created_at > now() - interval '30 days'
              ), 0)::int as recent
         from ledger where user_id = $1 and kind = 'referral'`,
      [userId],
    ),
    // The run rate is computed from what each live referral will actually be
    // charged — a founder pays half, so crediting them at list price would
    // print a projection nobody ever receives.
    query<{ plan: PaidPlan; founding: boolean }>(
      `select plan, founding from "user"
        where referred_by = $1 and plan in ('pro', 'team')
          and paid_until is not null and paid_until > now()`,
      [userId],
    ),
  ]);

  const runRateCents = active.reduce((sum, u) => {
    const price = PLAN_PRICE_CENTS[u.plan] ?? 0;
    return sum + commissionCents(u.founding ? Math.round(price / 2) : price);
  }, 0);

  return {
    clicks: clicks[0]?.all ?? 0,
    clicks30d: clicks[0]?.recent ?? 0,
    signups: people[0]?.signups ?? 0,
    paying: people[0]?.paying ?? 0,
    earnedCents: earned[0]?.all ?? 0,
    earned30dCents: earned[0]?.recent ?? 0,
    runRateCents,
  };
}

/** The most recent things that happened to a link, for the activity list. */
export interface ReferralEvent {
  kind: "signup" | "commission";
  at: string;
  /** The referral, as much of them as an affiliate is entitled to see. */
  who: string;
  amountCents?: number;
}

export async function referralActivity(userId: string, limit = 12): Promise<ReferralEvent[]> {
  const [signups, commissions] = await Promise.all([
    query<{ at: string; handle: string | null; email: string }>(
      `select to_char("createdAt" at time zone 'UTC', 'YYYY-MM-DD') as at, handle, email
         from "user" where referred_by = $1
        order by "createdAt" desc limit $2`,
      [userId, limit],
    ),
    query<{ at: string; amount_cents: number; note: string | null }>(
      `select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as at, amount_cents, note
         from ledger where user_id = $1 and kind = 'referral'
        order by id desc limit $2`,
      [userId, limit],
    ),
  ]);

  const events: ReferralEvent[] = [
    ...signups.map((s) => ({
      kind: "signup" as const,
      at: s.at,
      // A handle is public; an email is not, and an affiliate has no claim on
      // one. Masked to the shape of an address so the row still reads as a
      // person rather than as a blank.
      who: s.handle ?? maskEmail(s.email),
    })),
    ...commissions.map((c) => ({
      kind: "commission" as const,
      at: c.at,
      who: c.note?.split("·").pop()?.trim() ?? "a referral",
      amountCents: c.amount_cents,
    })),
  ];

  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 2)}${"•".repeat(Math.max(2, local.length - 2))}@${domain}`;
}
