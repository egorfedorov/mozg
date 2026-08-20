import { maybeOne, tx } from "@/db";
import { move } from "@/lib/money";
import { payReferralCommission } from "@/lib/referral";
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
/** The launch offer: this many first-paying accounts keep half price forever. */
export const FOUNDING_LIMIT = 50;

export async function foundingSpotsLeft(): Promise<number> {
  const row = await maybeOne<{ n: number }>(
    `select count(*)::int as n from "user" where founding`,
  );
  return Math.max(0, FOUNDING_LIMIT - (row?.n ?? 0));
}

export interface PromoCheck {
  ok: boolean;
  percentOff?: number;
  reason?: "unknown" | "expired" | "exhausted" | "already-used";
}

/** Validate a code for this user without spending it — the pricing UI's
    "check" and the checkout's precondition share one truth. */
export async function checkPromo(code: string, userId: string): Promise<PromoCheck> {
  const promo = await maybeOne<{ percent_off: number; max_uses: number; expires_at: Date | null }>(
    `select percent_off, max_uses, expires_at from promo_codes where code = $1`,
    [code.trim().toUpperCase()],
  );
  if (!promo) return { ok: false, reason: "unknown" };
  if (promo.expires_at && promo.expires_at < new Date()) return { ok: false, reason: "expired" };
  const used = await maybeOne<{ n: number; mine: number }>(
    `select count(*)::int as n,
            count(*) filter (where user_id = $2)::int as mine
       from promo_redemptions where code = $1`,
    [code.trim().toUpperCase(), userId],
  );
  if ((used?.mine ?? 0) > 0) return { ok: false, reason: "already-used" };
  if ((used?.n ?? 0) >= promo.max_uses) return { ok: false, reason: "exhausted" };
  return { ok: true, percentOff: promo.percent_off };
}

export async function payPlanFromBalance(opts: {
  userId: string;
  plan: PaidPlan;
  /** Optional promo code — the better of promo and founding applies, they
      never stack: a discount on a discount is a pricing bug, not generosity. */
  promoCode?: string;
}): Promise<PayPlanResult> {
  return tx(async (client) => {
    // Lock first — two clicks a millisecond apart must not both see enough.
    const locked = await client.query<{ balance_cents: number; founding: boolean }>(
      `select balance_cents, founding from "user" where id = $1 for update`,
      [opts.userId],
    );
    if (!locked.rows.length) throw new Error(`no such user: ${opts.userId}`);

    // Founding pricing, decided inside the lock: an existing founder keeps
    // half price forever; a new payer takes a spot if any remain. Counting
    // inside the transaction means fifty-one concurrent first payments still
    // produce exactly fifty founders.
    const wasFounding = locked.rows[0].founding;
    let founding = wasFounding;
    if (!founding) {
      const spots = await client.query<{ n: number }>(
        `select count(*)::int as n from "user" where founding`,
      );
      founding = spots.rows[0].n < FOUNDING_LIMIT;
    }

    // The promo, validated under the code's row lock so max_uses cannot be
    // overrun by concurrent redeemers. The better of promo and founding
    // applies — never both.
    const code = opts.promoCode?.trim().toUpperCase() || null;
    let promoPercent = 0;
    if (code) {
      const promo = await client.query<{ percent_off: number; max_uses: number; expires_at: Date | null }>(
        `select percent_off, max_uses, expires_at from promo_codes
          where code = $1 for update`,
        [code],
      );
      if (promo.rows.length && (!promo.rows[0].expires_at || promo.rows[0].expires_at > new Date())) {
        const used = await client.query<{ n: number; mine: number }>(
          `select count(*)::int as n,
                  count(*) filter (where user_id = $2)::int as mine
             from promo_redemptions where code = $1`,
          [code, opts.userId],
        );
        if (used.rows[0].mine === 0 && used.rows[0].n < promo.rows[0].max_uses) {
          promoPercent = promo.rows[0].percent_off;
        }
      }
    }

    const foundingPercent = founding ? 50 : 0;
    const promoWins = promoPercent > foundingPercent;
    const percentOff = Math.max(promoPercent, foundingPercent);
    const fullCents = PLAN_PRICE_CENTS[opts.plan];
    const priceCents = Math.round((fullCents * (100 - percentOff)) / 100);

    // The insufficient return COMMITS (tx only rolls back on throw), so the
    // spot and the redemption are claimed strictly after the money clears.
    if (locked.rows[0].balance_cents < priceCents) {
      return { ok: false as const, reason: "insufficient" as const };
    }
    if (founding && !wasFounding) {
      await client.query(`update "user" set founding = true where id = $1`, [opts.userId]);
    }
    if (promoWins && code) {
      await client.query(
        `insert into promo_redemptions (code, user_id, plan, discount_cents)
         values ($1, $2, $3, $4)`,
        [code, opts.userId, opts.plan, fullCents - priceCents],
      );
    }

    // A 100% code buys the month with no money moving — the ledger records
    // movements, not gifts, and move() rightly refuses a zero.
    if (priceCents > 0) {
      await move({
        client,
        userId: opts.userId,
        amountCents: -priceCents,
        kind: "plan",
        note:
          `${opts.plan} plan, ${PLAN_PERIOD_DAYS} days` +
          (promoWins ? `, promo ${code} −${percentOff}%` : founding ? ", founding −50%" : ""),
      });
    }

    // Whoever brought them gets their cut of this payment, inside the same
    // transaction — that is what makes the programme recurring without a
    // subscription to hang it on. Every renewal is another payment through
    // here, so every renewal pays again, and a month that is not paid for
    // pays nobody.
    //
    // The referrer's row is credited without being locked first, which is the
    // rule at the top of money.ts and correct here: the movement is positive,
    // so it is a blind increment rather than a read-then-write, and Postgres
    // serialises those on the row itself. Nor can two of these deadlock —
    // referred_by is written once, at signup, and can only point at an account
    // that already existed, so the referral graph has no cycles to wait around.
    await payReferralCommission(client, {
      payerId: opts.userId,
      paidCents: priceCents,
      note: `${opts.plan} plan`,
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
