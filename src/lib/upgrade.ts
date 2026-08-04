import { maybeOne, tx } from "@/db";
import { move } from "@/lib/money";
import { PLAN_PRICE_CENTS, PLAN_PERIOD_DAYS, type PaidPlan } from "@/lib/plans";

/**
 * Upgrading the plan.
 *
 * Two doors, one table:
 *   1. The user asks — a pending row in plan_requests, closed by an operator
 *      (approve grants the plan, reject just closes the row).
 *   2. The user pays from the balance — one transaction that locks their row,
 *      debits the price into the ledger, sets the plan with paid_until, and
 *      closes any open request as approved: the payment IS the approval.
 *
 * Neither door is a subscription. paid_until = now + 30 days per payment, and
 * an expired plan reads as free (lib/plans.ts effectivePlan).
 */

export interface PlanRequest {
  id: string;
  user_id: string;
  plan: PaidPlan;
  status: "pending" | "approved" | "rejected";
  created_at: Date;
  resolved_at: Date | null;
  resolved_by: string | null;
}

/** The request waiting on an answer, if there is one — at most one can exist. */
export async function pendingPlanRequest(userId: string): Promise<PlanRequest | null> {
  return maybeOne<PlanRequest>(
    `select * from plan_requests where user_id = $1 and status = 'pending'`,
    [userId],
  );
}

export type RequestResult = { ok: true } | { ok: false; reason: "already-pending" };

/**
 * Ask for a plan. The partial unique index is the guard — a second click
 * while one is open does nothing rather than stacking requests.
 */
export async function requestPlanUpgrade(
  userId: string,
  plan: PaidPlan,
): Promise<RequestResult> {
  const rows = await maybeOne<{ id: string }>(
    `insert into plan_requests (user_id, plan) values ($1, $2)
     on conflict (user_id) where status = 'pending' do nothing
     returning id`,
    [userId, plan],
  );
  return rows ? { ok: true } : { ok: false, reason: "already-pending" };
}

export type PayPlanResult =
  | { ok: true; paidCents: number; balanceCents: number }
  | { ok: false; reason: "insufficient" };

/**
 * Buy a month of a plan from the balance. The price comes from
 * PLAN_PRICE_CENTS here, never from the caller — same rule as purchaseBrain:
 * a posted price is a number the buyer chose.
 */
export async function payPlanFromBalance(opts: {
  userId: string;
  plan: PaidPlan;
}): Promise<PayPlanResult> {
  const priceCents = PLAN_PRICE_CENTS[opts.plan];

  return tx(async (client) => {
    // Lock first — two clicks a millisecond apart must not both see enough.
    const locked = await client.query<{ balance_cents: number }>(
      `select balance_cents from "user" where id = $1 for update`,
      [opts.userId],
    );
    if (!locked.rows.length) throw new Error(`no such user: ${opts.userId}`);
    if (locked.rows[0].balance_cents < priceCents) {
      return { ok: false as const, reason: "insufficient" as const };
    }

    await move({
      client,
      userId: opts.userId,
      amountCents: -priceCents,
      kind: "plan",
      note: `${opts.plan} plan, ${PLAN_PERIOD_DAYS} days`,
    });

    await client.query(
      `update "user"
          set plan = $2,
              paid_until = now() + interval '1 day' * $3,
              "updatedAt" = now()
        where id = $1`,
      [opts.userId, opts.plan, PLAN_PERIOD_DAYS],
    );

    // Paying settles any open ask — there is nothing left to approve.
    await client.query(
      `update plan_requests
          set status = 'approved', resolved_at = now(), resolved_by = 'balance'
        where user_id = $1 and status = 'pending'`,
      [opts.userId],
    );

    const after = await client.query<{ balance_cents: number }>(
      `select balance_cents from "user" where id = $1`,
      [opts.userId],
    );
    return {
      ok: true as const,
      paidCents: priceCents,
      balanceCents: after.rows[0].balance_cents,
    };
  });
}

export type ResolveResult = { ok: true } | { ok: false; reason: "not-open" };

/**
 * Close a request by hand. Approving grants the plan with its own 30-day
 * clock — the operator's permanent grants go through setPlan instead, which
 * leaves paid_until null. Rejecting only closes the row; nothing else moves.
 */
export async function resolvePlanRequest(opts: {
  requestId: string;
  approve: boolean;
  resolvedBy: string;
}): Promise<ResolveResult> {
  return tx(async (client) => {
    const { rows } = await client.query<{ user_id: string; plan: PaidPlan }>(
      `select user_id, plan from plan_requests
        where id = $1 and status = 'pending' for update`,
      [opts.requestId],
    );
    if (!rows.length) return { ok: false as const, reason: "not-open" as const };
    const { user_id, plan } = rows[0];

    if (opts.approve) {
      await client.query(
        `update "user"
            set plan = $2,
                paid_until = now() + interval '1 day' * $3,
                "updatedAt" = now()
          where id = $1`,
        [user_id, plan, PLAN_PERIOD_DAYS],
      );
    }

    await client.query(
      `update plan_requests
          set status = $2, resolved_at = now(), resolved_by = $3
        where id = $1`,
      [opts.requestId, opts.approve ? "approved" : "rejected", opts.resolvedBy],
    );
    return { ok: true as const };
  });
}
