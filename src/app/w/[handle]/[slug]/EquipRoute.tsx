"use client";

import { useT } from "@/lib/t-client";
import { useActionState } from "react";
import { equipRoute } from "./equip-action";

/**
 * One button for "give me what this route reads".
 *
 * The alternative is ten tabs and ten decisions before any work starts, which
 * is where somebody stops. Free brains are shelved, paid ones are bought from
 * the balance at the price on their own page — never a price posted from here.
 */
export default function EquipRoute({
  handle,
  slug,
  costCents,
  missing,
}: {
  handle: string;
  slug: string;
  costCents: number;
  missing: number;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(equipRoute, null);

  if (!missing && !state) return null;

  return (
    <form action={action} style={{ display: "grid", gap: ".5rem", marginTop: "1rem" }}>
      <input type="hidden" name="handle" value={handle} />
      <input type="hidden" name="slug" value={slug} />

      <button className="btn" disabled={pending} style={{ justifySelf: "start" }}>
        {pending
          ? t("Getting the shelf ready…")
          : costCents > 0
            ? `${t("Get everything this route reads")} — $${(costCents / 100).toFixed(2)}`
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
