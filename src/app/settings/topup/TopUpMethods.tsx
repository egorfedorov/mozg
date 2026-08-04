"use client";

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
  email,
}: {
  /** True once the NOWPayments keys exist. */
  ready: boolean;
  email: string;
}) {
  const [state, action, pending] = useActionState(startTopUp, null);
  const [amount, setAmount] = useState<number>(AMOUNTS[1]);
  const [coin, setCoin] = useState<string>(COINS[0]);

  return (
    <div className="stack-tight">
      {/* ── crypto: the live method ─────────────────────────────────────── */}
      <div className="panel">
        <p className="eyebrow">Crypto — USDT, USDC, BTC and more</p>

        {state?.payUrl ? (
          <>
            <p style={{ margin: ".4rem 0 1rem" }}>
              {formatCents(state.amountCents ?? 0)} — the balance updates by
              itself once the network confirms it. You can close this page.
            </p>
            <a className="btn" href={state.payUrl} target="_blank" rel="noreferrer noopener">
              Open the payment page
            </a>
          </>
        ) : (
          <>
            <p style={{ color: "var(--ink-2)", margin: ".4rem 0 1rem" }}>
              {ready
                ? "Pick an amount — you get an address and an exact sum, and the balance updates itself when the network confirms, usually under a minute. Paid straight to the wallet, no processor in the middle."
                : "Pick an amount and a coin, and ask for an address — we reply the same day with where to send it, and credit the balance as soon as it lands. Same ledger the automatic gateway will write to."}
            </p>

            <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
              {AMOUNTS.map((cents) =>
                ready ? (
                  <form action={action} key={cents} style={{ display: "inline" }}>
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

                <a
                  className="btn"
                  href={`mailto:hi@mozg.sh?subject=${encodeURIComponent(
                    `Top up ${formatCents(amount)} in ${coin}`,
                  )}&body=${encodeURIComponent(
                    `Account: ${email}\nAmount: ${formatCents(amount)}\nCoin: ${coin}\n\nSend me an address, please.`,
                  )}`}
                >
                  Ask for a {coin} address
                </a>
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
                Making an invoice…
              </p>
            )}
          </>
        )}
      </div>

      {/* ── everything else: honest mockups ─────────────────────────────── */}
      <div className="panel" style={{ opacity: 0.55 }}>
        <p className="eyebrow">Card — Visa, Mastercard</p>
        <p style={{ color: "var(--ink-2)", margin: ".4rem 0 1rem" }}>
          Card payments are on the way. Until then crypto is the fast path, and
          a manual top-up by email works with any method you can name.
        </p>
        <button className="btn btn-ghost" disabled>
          Coming soon
        </button>
      </div>

      <div className="panel" style={{ opacity: 0.55 }}>
        <p className="eyebrow">PayPal · Apple Pay · Google Pay</p>
        <p style={{ color: "var(--ink-2)", margin: ".4rem 0 1rem" }}>
          Also planned. If one of these is the only way you can pay, write to{" "}
          <a href="mailto:hi@mozg.sh">hi@mozg.sh</a> — knowing what people need
          decides what ships first.
        </p>
        <button className="btn btn-ghost" disabled>
          Coming soon
        </button>
      </div>
    </div>
  );
}
