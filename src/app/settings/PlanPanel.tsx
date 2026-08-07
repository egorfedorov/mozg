"use client";

import { useState, useTransition } from "react";
import { useActionState } from "react";
import { requestUpgrade, payUpgrade, checkPromoAction } from "./actions";
import { formatCents } from "@/lib/money-math";
import { PLANS, PLAN_PRICE_CENTS, type PaidPlan } from "@/lib/plans";

/**
 * The one line under each price, read off the limits table rather than typed
 * out beside it. The hand-written version had drifted — it was still promising
 * 10k and 50k calls after both had tripled, which is the drift lib/plans.ts
 * warns about in its own first paragraph.
 */
function pitch(plan: PaidPlan): string {
  const l = PLANS[plan];
  const k = (n: number) => (n >= 1000 ? `${n / 1000}k` : String(n));
  return [
    l.seats > 1 ? `${l.seats} seats, one shared allowance` : null,
    `${l.brains} brains`,
    `${l.sources.toLocaleString("en-US")} sources each`,
    `${k(l.calls)} agent calls a month`,
    `$${l.monthlyExtractCents / 100} of our reading`,
  ]
    .filter(Boolean)
    .join(" · ");
}

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

  // The promo field checks itself the moment it is applied: the button price
  // updates when the code is real, the reason shows when it is not — nobody
  // should learn a code's fate from a failed payment.
  const [promo, setPromo] = useState("");
  const [promoResult, setPromoResult] = useState<
    null | { ok: true; percentOff: number } | { ok: false; message: string }
  >(null);
  const [checking, startChecking] = useTransition();
  const activeCode = promoResult?.ok ? promo : "";
  const priceFor = (plan: PaidPlan) =>
    promoResult?.ok
      ? Math.round((PLAN_PRICE_CENTS[plan] * (100 - promoResult.percentOff)) / 100)
      : PLAN_PRICE_CENTS[plan];
  function applyPromo() {
    const code = promo.trim();
    if (!code) return setPromoResult(null);
    startChecking(async () => setPromoResult(await checkPromoAction(code)));
  }

  if (!targets.length) return null;

  return (
    // #plan: the pricing page's Subscribe buttons link straight here, so the
    // button and the thing it promises are one click apart.
    <div id="plan" className="panel" style={{ marginTop: "1.5rem", scrollMarginTop: "6rem" }}>
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

      <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center", marginTop: "1rem" }}>
        <input
          value={promo}
          onChange={(e) => { setPromo(e.target.value.toUpperCase()); setPromoResult(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyPromo(); } }}
          placeholder="Promo code"
          autoComplete="off"
          style={{
            width: "11rem",
            padding: ".45rem .6rem",
            border: promoResult ? `1.5px solid var(${promoResult.ok ? "--color-riso-green" : "--color-riso-red"})` : "1.5px solid var(--ink)",
            background: "var(--paper)",
            font: "inherit",
            fontSize: ".8125rem",
          }}
        />
        <button type="button" className="btn btn-ghost" onClick={applyPromo} disabled={checking || !promo.trim()} style={{ padding: ".45rem .8rem" }}>
          {checking ? "Checking…" : "Apply"}
        </button>
        {promoResult?.ok && (
          <span className="mono" style={{ fontSize: ".8125rem", color: "var(--color-riso-green)" }}>
            {promoResult.percentOff === 100 ? "free month applied" : `−${promoResult.percentOff}% applied`}
          </span>
        )}
        {promoResult && !promoResult.ok && (
          <span className="mono" style={{ fontSize: ".8125rem", color: "var(--color-riso-red)" }}>
            {promoResult.message}
          </span>
        )}
      </div>

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
                {pitch(plan)}
              </span>
            </div>

            <span style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
              {/* Always rendered: a 100% promo code makes the month free, so
                  hiding the form behind the full-price balance check would
                  lock out exactly the person the code was minted for. */}
              <form action={payAction} style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
                <input type="hidden" name="plan" value={plan} />
                <input type="hidden" name="promo" value={activeCode} />
                <button className="btn" type="submit" disabled={payPending}>
                  {payPending
                    ? "Paying…"
                    : priceFor(plan) === 0
                      ? "Activate the free month"
                      : `Pay ${formatCents(priceFor(plan))} from balance`}
                </button>
                {promoResult?.ok && priceFor(plan) > 0 && (
                  <s className="mono" style={{ alignSelf: "center", fontSize: ".75rem", color: "var(--ink-3)" }}>
                    {formatCents(PLAN_PRICE_CENTS[plan])}
                  </s>
                )}
              </form>
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
