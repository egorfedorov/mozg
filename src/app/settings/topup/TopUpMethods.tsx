"use client";

import { useT } from "@/lib/t-client";
import { markup } from "@/lib/markup";
import { useActionState, useState } from "react";
import { startTopUp } from "../actions";
import { formatCents } from "@/lib/money-math";

/**
 * The top-up page's method picker.
 *
 * Crypto is the one method that actually credits a balance today. When the
 * gateway is configured it makes a real invoice; until then it is a manual
 * request — the same ledger either way, so nothing is lost by starting
 * manually. Card and the rest are shown greyed out on purpose: people look
 * for the method they know, and "coming soon" answers that question honestly
 * where hiding the option would read as "they only do crypto".
 */

const AMOUNTS = [1000, 2500, 5000, 10000];

const COINS = ["USDT", "USDC", "BTC", "ETH", "TON", "SOL", "LTC"];

export default function TopUpMethods({
  ready,
  coins = [],
}: {
  /** True once any crypto rail is configured. */
  ready: boolean;
  /** mozgpay coins available for direct payment. */
  coins?: { key: string; label: string; note?: string }[];
}) {
  const t = useT();

  const [state, action, pending] = useActionState(startTopUp, null);
  const [amount, setAmount] = useState<number>(AMOUNTS[1]);
  const [coin, setCoin] = useState<string>(COINS[0]);
  const [payCoin, setPayCoin] = useState<string>(coins[0]?.key ?? "usdt-trc20");

  return (
    <div className="stack-tight">
      {/* ── crypto: the live method ─────────────────────────────────────── */}
      <div className="panel">
        <p className="eyebrow">{t("Crypto — USDT, USDC, BTC and more")}</p>

        {state?.payUrl ? (
          <>
            <p style={{ margin: ".4rem 0 1rem" }}>
              {markup(t("<0/> — the balance updates by itself once the network confirms it. You can close this page."), [
              formatCents(state.amountCents ?? 0),
            ])}</p>
            <a className="btn" href={state.payUrl} target="_blank" rel="noreferrer noopener">
              {t("Open the payment page")}</a>
          </>
        ) : (
          <>
            <p style={{ color: "var(--ink-2)", margin: ".4rem 0 1rem" }}>
              {ready
                ? t("Pick an amount — you get an address and an exact sum, and the balance updates itself when the network confirms, usually under a minute. Paid straight to the wallet, no processor in the middle.")
                : t("Pick an amount and a coin, and ask for an address — we reply the same day with where to send it, and credit the balance as soon as it lands. Same ledger the automatic gateway will write to.")}
            </p>

            {ready && coins.length > 0 && (
              <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                {coins.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className="btn btn-ghost mono"
                    title={c.note}
                    onClick={() => setPayCoin(c.key)}
                    style={{
                      padding: ".3rem .6rem",
                      fontSize: ".8125rem",
                      ...(payCoin === c.key
                        ? { background: "var(--ink)", color: "var(--paper)" }
                        : {}),
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
              {AMOUNTS.map((cents) =>
                ready ? (
                  <form action={action} key={cents} style={{ display: "inline" }}>
                    <input type="hidden" name="coin" value={payCoin} />
                    <button
                      name="amount"
                      value={String(cents)}
                      className="btn btn-ghost"
                      disabled={pending}
                      style={{ fontSize: ".9375rem" }}
                    >
                      {formatCents(cents)}
                    </button>
                  </form>
                ) : (
                  <button
                    key={cents}
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setAmount(cents)}
                    style={{
                      fontSize: ".9375rem",
                      ...(amount === cents
                        ? { background: "var(--ink)", color: "var(--paper)" }
                        : {}),
                    }}
                  >
                    {formatCents(cents)}
                  </button>
                ),
              )}
            </div>

            {!ready && (
              <>
                <div
                  style={{ display: "flex", gap: ".4rem", flexWrap: "wrap", marginBottom: "1rem" }}
                >
                  {COINS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="btn btn-ghost mono"
                      onClick={() => setCoin(c)}
                      style={{
                        padding: ".3rem .6rem",
                        fontSize: ".8125rem",
                        ...(coin === c
                          ? { background: "var(--ink)", color: "var(--paper)" }
                          : {}),
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>

                <a className="btn" href="/chat">{markup(t("Ask for a <0/> address in chatmozg"), [
                  coin,
                ])}</a>
              </>
            )}

            {state?.error && (
              <p
                className="mono"
                style={{ color: "var(--color-riso-red)", fontSize: ".8125rem", margin: ".75rem 0 0" }}
              >
                {state.error}
              </p>
            )}
            {pending && (
              <p className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)", margin: ".75rem 0 0" }}>
                {t("Making an invoice…")}</p>
            )}
          </>
        )}
      </div>

      {/* ── everything else: honest mockups ─────────────────────────────── */}
      <div className="panel" style={{ opacity: 0.55 }}>
        <p className="eyebrow">{t("Card — Visa, Mastercard")}</p>
        <p style={{ color: "var(--ink-2)", margin: ".4rem 0 1rem" }}>
          {t("Card payments are on the way. Until then crypto is the fast path, and a manual top-up by email works with any method you can name.")}</p>
        <button className="btn btn-ghost" disabled>
          {t("Coming soon")}</button>
      </div>

      <div className="panel" style={{ opacity: 0.55 }}>
        <p className="eyebrow">{t("PayPal · Apple Pay · Google Pay")}</p>
        <p style={{ color: "var(--ink-2)", margin: ".4rem 0 1rem" }}>
          {markup(t("Also planned. If one of these is the only way you can pay, write to <0>chatmozg</0> — knowing what people need decides what ships first."), [
          <a href="/chat" key="s0" />,
        ])}</p>
        <button className="btn btn-ghost" disabled>
          {t("Coming soon")}</button>
      </div>
    </div>
  );
}
