"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buyBrain } from "@/app/b/[handle]/[slug]/buy-action";
// money-math, not money: this is a client component and @/lib/money drags in pg.
import { formatCents } from "@/lib/money-math";

export default function BuyBrain({
  handle,
  slug,
  priceCents,
  partOf,
  balanceCents,
  signedIn,
}: {
  handle: string;
  slug: string;
  priceCents: number;
  /** Set when this brain is unlocked by buying the family it belongs to. */
  partOf?: string | null;
  balanceCents: number | null;
  signedIn: boolean;
}) {
  const [state, action, pending] = useActionState(buyBrain, null);
  const path = `/b/${handle}/${slug}`;
  const short = balanceCents !== null && balanceCents < priceCents;

  return (
    <section className="panel" style={{ borderLeft: "4px solid var(--color-riso-yellow)" }}>
      <p className="eyebrow">Paid brain</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: ".6rem", margin: ".4rem 0 .5rem" }}>
        <span className="display" style={{ fontSize: "2.25rem", lineHeight: 1 }}>
          {formatCents(priceCents)}
        </span>
        <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)" }}>
          once · keeps working as the author updates it
        </span>
      </div>

      <p style={{ color: "var(--ink-2)", margin: "0 0 1rem", maxWidth: "52ch", fontSize: ".9375rem" }}>
        {partOf ? (
          <>
            This is part of <strong>{partOf}</strong> and is not sold on its
            own — one purchase unlocks the whole family, this brain included.{" "}
          </>
        ) : null}
        Buying unlocks the notes for your agents and for you. Paid from your
        balance. A brain can be copied once it is readable, so there are no
        refunds after the first read — decide from the preview below.
      </p>

      {!signedIn ? (
        <Link className="btn" href={`/sign-in?next=${encodeURIComponent(path)}`}>
          Sign in to buy
        </Link>
      ) : (
        <form action={action} style={{ display: "grid", gap: ".6rem" }}>
          <input type="hidden" name="handle" value={handle} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="path" value={path} />

          <div style={{ display: "flex", gap: ".6rem", alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn" disabled={pending || short}>
              {pending ? "Buying…" : `Buy for ${formatCents(priceCents)}`}
            </button>
            {balanceCents !== null && (
              <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)" }}>
                balance {formatCents(balanceCents)}
              </span>
            )}
          </div>

          {short && (
            <p className="mono" style={{ fontSize: ".8125rem", margin: 0, color: "var(--ink-2)" }}>
              Short by {formatCents(priceCents - (balanceCents ?? 0))} —{" "}
              <Link href="/settings/balance" style={{ textDecoration: "underline" }}>
                top up
              </Link>
            </p>
          )}

          {state?.error && (
            <p className="mono" style={{ fontSize: ".8125rem", margin: 0, color: "var(--color-riso-red)" }}>
              {state.error}
              {state.topUp && (
                <>
                  {" "}
                  <Link href="/settings/balance" style={{ textDecoration: "underline" }}>
                    top up
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
