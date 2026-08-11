"use client";

import { useT } from "@/lib/t-client";
import { fill } from "@/lib/markup";
import { useActionState } from "react";
import { formatCents } from "@/lib/money-math";
import { equipRoute } from "./equip-action";

/**
 * One button for "give me what this route reads".
 *
 * The alternative is ten tabs and ten decisions before any work starts, which
 * is where somebody stops. Free brains are shelved, and what is paid is bought
 * the cheapest way there is: a pack when the pack is cheaper than its parts,
 * the brain on its own when it is not. The line above the button says which,
 * because a reader who cannot see that they are buying a pack has to trust the
 * total — and this page is meant to end exactly that kind of trust.
 */
export default function EquipRoute({
  handle,
  slug,
  costCents,
  missing,
  packs,
  singles,
}: {
  handle: string;
  slug: string;
  costCents: number;
  missing: number;
  packs: { title: string; priceCents: number; covers: number }[];
  singles: number;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(equipRoute, null);

  if (!missing && !state) return null;

  return (
    <form action={action} style={{ display: "grid", gap: ".5rem", marginTop: "1rem" }}>
      <input type="hidden" name="handle" value={handle} />
      <input type="hidden" name="slug" value={slug} />

      {packs.map((p) => (
        <p key={p.title} style={{ margin: 0, color: "var(--ink-2)", fontSize: ".9375rem" }}>
          {fill(
            t("<0/> opens <1/> of the brains below, and costs less than buying them one at a time: <2/>, once, for everything in it."),
            [p.title, p.covers, formatCents(p.priceCents)],
          )}
        </p>
      ))}
      {singles > 0 && (
        <p style={{ margin: 0, color: "var(--ink-2)", fontSize: ".9375rem" }}>
          {fill(
            singles === 1
              ? t("<0/> more is sold on its own and is bought at the price on its page.")
              : t("<0/> more are sold on their own and are bought at the price on their pages."),
            [singles],
          )}
        </p>
      )}

      <button className="btn" disabled={pending} style={{ justifySelf: "start" }}>
        {pending
          ? t("Opening the route…")
          : costCents > 0
            ? `${t("Open this route")} — ${formatCents(costCents)}`
            : t("Add everything this route reads")}
      </button>

      {state && "error" in state && state.error && (
        <p className="mono" style={{ fontSize: ".8125rem", color: "var(--color-riso-red)", margin: 0 }}>
          {state.error}
        </p>
      )}
      {state && "ok" in state && state.ok && (
        <p className="mono" style={{ fontSize: ".8125rem", margin: 0 }}>
          {state.message}
        </p>
      )}
    </form>
  );
}
