"use client";

import { useActionState } from "react";
import { requestUpgrade, payUpgrade } from "./actions";
import { formatCents } from "@/lib/money-math";
import { PLAN_PRICE_CENTS, type PaidPlan } from "@/lib/plans";

const PITCH: Record<PaidPlan, string> = {
  pro: "20 brains · 1,000 sources each · 10k agent calls a month · agents can write back",
  team: "100 brains · 5,000 sources each · 50k agent calls a month · everything in Pro",
};

/**
 * The upgrade block. Two doors into the same plan: pay from the balance right
 * now (offered only when the balance actually covers the month), or ask and
 * let a human switch the account — same as it has always worked, except the
 * asking no longer means writing an email.
 */
export default function PlanPanel({
  balanceCents,
  pending,
  targets,
}: {
  balanceCents: number;
  /** The open request, if one is waiting on an operator. */
  pending: { plan: PaidPlan; createdAt: string } | null;
  /** Plans above the current one, in order. */
  targets: PaidPlan[];
}) {
  const [reqState, reqAction, reqPending] = useActionState(requestUpgrade, null);
  const [payState, payAction, payPending] = useActionState(payUpgrade, null);

  if (!targets.length) return null;

  return (
    <div className="panel" style={{ marginTop: "1.5rem" }}>
      <p className="eyebrow">Need more room</p>

      {pending ? (
        <p style={{ color: "var(--ink-2)", margin: ".4rem 0 0" }}>
          You asked for <strong>{pending.plan}</strong> on{" "}
          {new Date(pending.createdAt).toISOString().slice(0, 10)} — it is
          waiting for a human, usually the same day. Paying from the balance
          below upgrades immediately and closes the request.
        </p>
      ) : (
        <p style={{ color: "var(--ink-2)", margin: ".4rem 0 0" }}>
          A month at a time, no subscription — pay from your balance and it is
          live immediately, or ask and we switch the account by hand.
        </p>
      )}

      <div style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
        {targets.map((plan) => (
          <div
            key={plan}
            style={{
              display: "flex",
              gap: "1rem",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <strong style={{ textTransform: "capitalize" }}>
                {plan} — {formatCents(PLAN_PRICE_CENTS[plan])}/mo
              </strong>
              <span
                className="mono"
                style={{ display: "block", fontSize: ".75rem", color: "var(--ink-2)", marginTop: ".2rem" }}
              >
                {PITCH[plan]}
              </span>
            </div>

            <span style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
              {balanceCents >= PLAN_PRICE_CENTS[plan] && (
                <form action={payAction}>
                  <input type="hidden" name="plan" value={plan} />
                  <button className="btn" type="submit" disabled={payPending}>
                    {payPending ? "Paying…" : `Pay ${formatCents(PLAN_PRICE_CENTS[plan])} from balance`}
                  </button>
                </form>
              )}
              {!pending && (
                <form action={reqAction}>
                  <input type="hidden" name="plan" value={plan} />
                  <button
                    className={balanceCents >= PLAN_PRICE_CENTS[plan] ? "btn btn-ghost" : "btn"}
                    type="submit"
                    disabled={reqPending}
                  >
                    {reqPending ? "Asking…" : `Request ${plan}`}
                  </button>
                </form>
              )}
            </span>
          </div>
        ))}
      </div>

      {(reqState?.error || payState?.error) && (
        <p className="mono" style={{ color: "var(--color-riso-red)", fontSize: ".8125rem", margin: ".75rem 0 0" }}>
          {reqState?.error ?? payState?.error}
        </p>
      )}
      {reqState?.ok && (
        <p className="mono" style={{ color: "var(--color-riso-green)", fontSize: ".8125rem", margin: ".75rem 0 0" }}>
          Requested {reqState.plan}. We switch accounts by hand, usually the same day.
        </p>
      )}
      {payState?.ok && (
        <p className="mono" style={{ color: "var(--color-riso-green)", fontSize: ".8125rem", margin: ".75rem 0 0" }}>
          Paid {formatCents(payState.paidCents)} — {payState.plan} is live for the next 30 days.
        </p>
      )}
    </div>
  );
}
