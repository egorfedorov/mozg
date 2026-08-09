"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buyBrain, buyWithCrypto } from "@/app/b/[handle]/[slug]/buy-action";
// money-math, not money: this is a client component and @/lib/money drags in pg.
import { formatCents } from "@/lib/money-math";
import { useT } from "@/lib/t-client";
import { markup } from "@/lib/markup";

export default function BuyBrain({
  handle,
  slug,
  priceCents,
  partOf,
  balanceCents,
  signedIn,
  cryptoReady = false,
}: {
  handle: string;
  slug: string;
  priceCents: number;
  /** Set when this brain is unlocked by buying the family it belongs to. */
  partOf?: string | null;
  balanceCents: number | null;
  signedIn: boolean;
  /** True once the crypto gateway is configured — shows one-click checkout. */
  cryptoReady?: boolean;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(buyBrain, null);
  const [crypto, cryptoAction, cryptoPending] = useActionState(buyWithCrypto, null);
  const path = `/b/${handle}/${slug}`;
  const short = balanceCents !== null && balanceCents < priceCents;

  return (
    <section className="panel" style={{ borderLeft: "4px solid var(--color-riso-yellow)" }}>
      <p className="eyebrow">{t("Paid brain")}</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: ".6rem", margin: ".4rem 0 .5rem" }}>
        <span className="display" style={{ fontSize: "2.25rem", lineHeight: 1 }}>
          {formatCents(priceCents)}
        </span>
        <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)" }}>
          {t("once · keeps working as the author updates it")}
        </span>
      </div>

      <p style={{ color: "var(--ink-2)", margin: "0 0 1rem", maxWidth: "52ch", fontSize: ".9375rem" }}>
        {partOf ? (
          <>
            {markup(
              t(
                "This is part of <0/> and is not sold on its own — one purchase unlocks the whole family, this brain included.",
              ),
              [<strong key="s0">{partOf}</strong>],
            )}{" "}
          </>
        ) : null}
        {markup(
          t(
            "Buying unlocks the notes for your agents and for you. Paid from your balance; 95% goes to the author. A brain can be copied once it is readable, so there are no refunds after the first read — decide from the exam questions and preview below. <0>How paying works</0>.",
          ),
          [<Link href="/pricing" style={{ textDecoration: "underline" }} key="s0" />],
        )}
      </p>

      {!signedIn ? (
        <Link className="btn" href={`/sign-in?next=${encodeURIComponent(path)}`}>
          {t("Sign in to buy")}
        </Link>
      ) : (
        <form action={action} style={{ display: "grid", gap: ".6rem" }}>
          <input type="hidden" name="handle" value={handle} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="path" value={path} />

          <div style={{ display: "flex", gap: ".6rem", alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn" disabled={pending || short}>
              {pending
                ? t("Buying…")
                : markup(t("Buy for <0/>"), [formatCents(priceCents)])}
            </button>
            {balanceCents !== null && (
              <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)" }}>
                {markup(t("balance <0/>"), [formatCents(balanceCents)])}
              </span>
            )}
          </div>

          {short && (
            <p className="mono" style={{ fontSize: ".8125rem", margin: 0, color: "var(--ink-2)" }}>
              {markup(t("Short by <0/> — <1>top up</1>"), [
                formatCents(priceCents - (balanceCents ?? 0)),
                <Link href="/settings/balance" style={{ textDecoration: "underline" }} key="s1" />,
              ])}
            </p>
          )}

          {cryptoReady &&
            (crypto?.payUrl ? (
              <a className="btn" href={crypto.payUrl} target="_blank" rel="noreferrer noopener">
                {t("Open the payment page")}
              </a>
            ) : (
              <button
                formAction={cryptoAction}
                className="btn btn-ghost"
                disabled={cryptoPending}
                style={{ justifySelf: "start" }}
              >
                {cryptoPending
                  ? t("Making an invoice…")
                  : t("Or pay with crypto — unlocks on confirmation")}
              </button>
            ))}
          {crypto?.error && (
            <p className="mono" style={{ fontSize: ".8125rem", margin: 0, color: "var(--color-riso-red)" }}>
              {crypto.error}
            </p>
          )}

          {state?.error && (
            <p className="mono" style={{ fontSize: ".8125rem", margin: 0, color: "var(--color-riso-red)" }}>
              {state.error}
              {state.topUp && (
                <>
                  {" "}
                  <Link href="/settings/balance" style={{ textDecoration: "underline" }}>
                    {t("top up")}
                  </Link>
                </>
              )}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
