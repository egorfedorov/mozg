"use client";

import { useT } from "@/lib/t-client";
import { markup } from "@/lib/markup";
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
  const t = useT();

  const [state, action, pending] = useActionState(askForPayout, null);

  if (open) {
    return (
      <div className="panel">
        <p className="eyebrow">{t("Withdrawal waiting")}</p>
        <p style={{ margin: ".4rem 0 0" }}>
          {markup(t("<0/> to <1/>"), [
          <strong key="s0">{formatCents(open.amount_cents)}</strong>,
          <span key="s1" className="mono" style={{ fontSize: ".8125rem" }}> {open.destination} </span>,
        ])}</p>
        <p style={{ color: "var(--ink-2)", margin: ".5rem 0 0", fontSize: ".9375rem" }}>
          {markup(t("Requested <0/>. Payouts are sent by hand, usually the same day. The money stays on your balance until it is sent, so nothing is in limbo."), [
          new Date(open.requested_at).toISOString().slice(0, 10),
        ])}</p>
      </div>
    );
  }

  if (balanceCents < minCents) {
    return (
      <div className="panel">
        <p className="eyebrow">{t("Withdrawing")}</p>
        <p style={{ color: "var(--ink-2)", margin: ".4rem 0 0" }}>
          {markup(t("The smallest withdrawal is <0/> — below that the transfer fee eats it. You have <1/>."), [
          formatCents(minCents),
          formatCents(balanceCents),
        ])}</p>
      </div>
    );
  }

  return (
    <form action={action} className="panel" style={{ display: "grid", gap: "1rem" }}>
      <div>
        <p className="eyebrow" style={{ margin: 0 }}>
          {t("Withdraw")}</p>
        <p style={{ color: "var(--ink-2)", margin: ".4rem 0 0", fontSize: ".9375rem" }}>
          {t("Paid in crypto by hand. Give the wallet address and the network — a USDT address on the wrong chain is money gone, so we do not guess.")}</p>
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
          placeholder={t("USDT TRC-20 · T…")}
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
          {t("Requested. Reload to see it.")}</p>
      )}

      <div>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? t("Sending…") : t("Request withdrawal")}
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
