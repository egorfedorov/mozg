"use client";

import { useActionState } from "react";
import { askForPayout } from "./actions";
import { formatCents } from "@/lib/money-math";

export default function PayoutForm({
  balanceCents,
  minCents,
  open,
}: {
  balanceCents: number;
  minCents: number;
  /** An outstanding request, if there is one. */
  open: { amount_cents: number; destination: string; requested_at: string } | null;
}) {
  const [state, action, pending] = useActionState(askForPayout, null);

  if (open) {
    return (
      <div className="panel">
        <p className="eyebrow">Withdrawal waiting</p>
        <p style={{ margin: ".4rem 0 0" }}>
          <strong>{formatCents(open.amount_cents)}</strong> to{" "}
          <span className="mono" style={{ fontSize: ".8125rem" }}>
            {open.destination}
          </span>
        </p>
        <p style={{ color: "var(--ink-2)", margin: ".5rem 0 0", fontSize: ".9375rem" }}>
          Requested {new Date(open.requested_at).toISOString().slice(0, 10)}. Payouts
          are sent by hand, usually the same day. The money stays on your balance
          until it is sent, so nothing is in limbo.
        </p>
      </div>
    );
  }

  if (balanceCents < minCents) {
    return (
      <div className="panel">
        <p className="eyebrow">Withdrawing</p>
        <p style={{ color: "var(--ink-2)", margin: ".4rem 0 0" }}>
          The smallest withdrawal is {formatCents(minCents)} — below that the
          transfer fee eats it. You have {formatCents(balanceCents)}.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="panel" style={{ display: "grid", gap: "1rem" }}>
      <div>
        <p className="eyebrow" style={{ margin: 0 }}>
          Withdraw
        </p>
        <p style={{ color: "var(--ink-2)", margin: ".4rem 0 0", fontSize: ".9375rem" }}>
          Paid in crypto by hand. Give the wallet address and the network — a
          USDT address on the wrong chain is money gone, so we do not guess.
        </p>
      </div>

      <span style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
        <span className="mono" style={{ color: "var(--ink-2)" }}>
          $
        </span>
        <input
          name="amount"
          type="number"
          min={minCents / 100}
          max={balanceCents / 100}
          step="0.01"
          defaultValue={(balanceCents / 100).toFixed(2)}
          required
          style={{ ...input, width: 120 }}
        />
        <input
          name="destination"
          placeholder="USDT TRC-20 · T…"
          required
          maxLength={200}
          style={{ ...input, flex: "1 1 22ch" }}
        />
      </span>

      {state?.error && (
        <p className="mono" style={{ color: "var(--color-riso-red)", fontSize: ".8125rem", margin: 0 }}>
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="mono" style={{ color: "var(--color-riso-green)", fontSize: ".8125rem", margin: 0 }}>
          Requested. Reload to see it.
        </p>
      )}

      <div>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Sending…" : "Request withdrawal"}
        </button>
      </div>
    </form>
  );
}

const input: React.CSSProperties = {
  padding: ".55rem .7rem",
  border: "1.5px solid var(--ink)",
  background: "var(--paper)",
  color: "var(--ink)",
  font: "inherit",
};
