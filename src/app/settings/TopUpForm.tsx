"use client";

import { useActionState } from "react";
import { startTopUp } from "./actions";
import { formatCents } from "@/lib/money-math";

/**
 * Buying balance. The amounts are buttons rather than a free field because
 * every one of them is a real invoice at a provider, and a typo in a currency
 * amount is the kind of mistake nobody notices until it has happened.
 */
const AMOUNTS = [1000, 2500, 5000, 10000];

export default function TopUpForm({
  ready,
  email,
}: {
  /** False until a payment provider is configured. */
  ready: boolean;
  email: string;
}) {
  const [state, action, pending] = useActionState(startTopUp, null);

  if (!ready) {
    return (
      <div className="panel">
        <p className="eyebrow">Topping up</p>
        <p style={{ color: "var(--ink-2)", margin: ".4rem 0 1rem" }}>
          The crypto gateway is not switched on yet, so top-ups are done by
          hand: write with the amount and we credit the balance the same day.
          Nothing is lost by starting this way — it is the same ledger the
          gateway writes to.
        </p>
        <a
          className="btn"
          href={`mailto:hi@mozg.sh?subject=${encodeURIComponent("Top up balance")}&body=${encodeURIComponent(`Account: ${email}\nAmount: `)}`}
        >
          Ask to top up
        </a>
      </div>
    );
  }

  if (state?.payUrl) {
    return (
      <div className="panel">
        <p className="eyebrow">Waiting for your payment</p>
        <p style={{ margin: ".4rem 0 1rem" }}>
          {formatCents(state.amountCents ?? 0)} — the balance updates by itself
          once the network confirms it. You can close this page.
        </p>
        <a className="btn" href={state.payUrl} target="_blank" rel="noreferrer noopener">
          Open the payment page
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="panel">
      <p className="eyebrow">Top up with crypto</p>
      <p style={{ color: "var(--ink-2)", margin: ".4rem 0 1rem" }}>
        Pick an amount and pay in whichever coin you like. The balance updates
        when the network confirms — usually a few minutes.
      </p>

      <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {AMOUNTS.map((cents) => (
          <button
            key={cents}
            name="amount"
            value={String(cents)}
            className="btn btn-ghost"
            disabled={pending}
            style={{ fontSize: ".9375rem" }}
          >
            {formatCents(cents)}
          </button>
        ))}
      </div>

      {state?.error && (
        <p className="mono" style={{ color: "var(--color-riso-red)", fontSize: ".8125rem", margin: 0 }}>
          {state.error}
        </p>
      )}
      {pending && (
        <p className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)", margin: 0 }}>
          Making an invoice…
        </p>
      )}
    </form>
  );
}
