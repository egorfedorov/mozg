import { maybeOne, query } from "@/db";
import type { GrantRole, Plan } from "@/db/types";
import { effectivePlan, limitsFor } from "@/lib/plans";

/**
 * Studio membership.
 *
 * A member is invited to a person, not to a brain: they read everything that
 * person owns, now and later. Two things follow from one row in `members`, and
 * they are deliberately kept apart in this file — what a member may *read*
 * (access.ts asks), and whose allowance their calls *spend* (the MCP route
 * asks).
 *
 * Matching is on a verified email, the same rule grants use and for the same
 * reason: without it, signing up as someone@their-studio.com collects the
 * studio. The invite therefore works the moment the colleague verifies, with
 * no acceptance step to forget.
 */

export interface Membership {
  ownerId: string;
  role: GrantRole;
  plan: Plan;
}

/**
 * The studio this person works in, or null.
 *
 * One studio per person, the oldest invitation winning. A colleague in two
 * studios is a real thing and this does not model it: the quota gate runs
 * before the tool has named a brain, so there is no brain to attribute the
 * call to at the moment the question is asked. Picking the oldest is at least
 * stable — it does not move when someone is invited elsewhere.
 */
export async function studioFor(userId: string): Promise<Membership | null> {
  const row = await maybeOne<{
    owner_id: string;
    role: GrantRole;
    plan: Plan;
    paid_until: Date | null;
  }>(
    `select m.owner_id, m.role, u.plan, u.paid_until
       from members m
       join "user" me on lower(me.email) = lower(m.email) and me."emailVerified"
       join "user" u on u.id = m.owner_id
      where me.id = $1
      order by m.invited_at
      limit 1`,
    [userId],
  );
  if (!row) return null;

  // The plan in force, not the plan on the row: a studio whose month lapsed
  // stops being a studio, and its members fall back to their own accounts
  // rather than riding on an expired seat.
  const plan = effectivePlan(row.plan, row.paid_until);
  if (limitsFor(plan).seats < 2) return null;

  return { ownerId: row.owner_id, role: row.role, plan };
}

/**
 * Does this person hold a seat in that studio, and in what role?
 *
 * Separate from studioFor because access is not billing: a person can hold
 * seats in two studios and must read both, while their calls can only come out
 * of one month. The plan check is here rather than in the SQL so the rule for
 * "what counts as a studio" lives in lib/plans.ts alone — a copy of the plan
 * names in a query is exactly how a limit ends up enforced on one path and not
 * the next.
 */
export async function seatIn(ownerId: string, userId: string): Promise<GrantRole | null> {
  const row = await maybeOne<{ role: GrantRole; plan: Plan; paid_until: Date | null }>(
    `select m.role, o.plan, o.paid_until
       from members m
       join "user" me on lower(me.email) = lower(m.email) and me."emailVerified"
       join "user" o on o.id = m.owner_id
      where m.owner_id = $1 and me.id = $2`,
    [ownerId, userId],
  );
  if (!row) return null;
  // A lapsed studio closes. Colleagues fall back to whatever the brains'
  // visibility gives everyone else, which for a private brain is nothing —
  // harsh, and the only version of a seat anyone would pay to keep.
  return limitsFor(effectivePlan(row.plan, row.paid_until)).seats > 1 ? row.role : null;
}

/**
 * Every account whose receipts this reader may use: themselves, plus any
 * studio they hold a live seat in.
 *
 * All of them, not the one studioFor picks — access is not billing. A person
 * can sit in two studios and must read what either of them bought, while their
 * calls can still only come out of one month.
 */
export async function payingAccountsFor(userId: string | null): Promise<string[]> {
  if (!userId) return [];
  const rows = await query<{ owner_id: string; plan: Plan; paid_until: Date | null }>(
    `select m.owner_id, o.plan, o.paid_until
       from members m
       join "user" me on lower(me.email) = lower(m.email) and me."emailVerified"
       join "user" o on o.id = m.owner_id
      where me.id = $1`,
    [userId],
  );
  const studios = rows
    .filter((r) => limitsFor(effectivePlan(r.plan, r.paid_until)).seats > 1)
    .map((r) => r.owner_id);
  return [userId, ...studios];
}

export interface Billing {
  /** The account this caller's usage is charged to. */
  id: string;
  plan: Plan;
  /** True when the allowance being spent belongs to someone else's studio. */
  shared: boolean;
}

/**
 * Whose month a call comes out of. Called on every MCP request, so it is one
 * indexed lookup and nothing more.
 */
export async function billingFor(
  userId: string,
  ownPlan: Plan,
  paidUntil?: Date | string | null,
): Promise<Billing> {
  const studio = await studioFor(userId);
  if (studio) return { id: studio.ownerId, plan: studio.plan, shared: true };
  return { id: userId, plan: effectivePlan(ownPlan, paidUntil), shared: false };
}

export interface Seat {
  id: string;
  email: string;
  role: GrantRole;
  invited_at: Date;
  /** Null until the invited address exists and is verified. */
  member_id: string | null;
}

/** The studio's roster, the owner excluded — they hold a seat by owning it. */
export async function seatsOf(ownerId: string): Promise<Seat[]> {
  return query<Seat>(
    `select m.id, m.email::text as email, m.role, m.invited_at,
            (select me.id from "user" me
              where lower(me.email) = lower(m.email) and me."emailVerified") as member_id
       from members m
      where m.owner_id = $1
      order by m.invited_at`,
    [ownerId],
  );
}

/**
 * Seats left to give, the owner's own counted. Zero on every plan but studio,
 * which is what makes the invite form refuse rather than quietly oversell.
 */
export async function seatsFree(ownerId: string, plan: Plan): Promise<number> {
  const taken = await maybeOne<{ n: number }>(
    `select count(*)::int as n from members where owner_id = $1`,
    [ownerId],
  );
  return Math.max(0, limitsFor(plan).seats - 1 - (taken?.n ?? 0));
}
