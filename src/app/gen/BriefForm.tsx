"use client";

import { useActionState } from "react";
import { useT } from "@/lib/t-client";
import { createPack } from "./actions";

/**
 * The brief.
 *
 * Four fields, because a studio ordering art already knows the theme and does
 * not want a wizard. What it does not know — how many symbols a paytable
 * needs, what a wild has to look like next to a scatter, which asset gets cut
 * out and which is full bleed — is the part the service supplies, so the form
 * asks for the world and picks the set.
 */
export default function BriefForm({
  balanceCents,
  setCosts,
}: {
  balanceCents: number;
  /** What each set costs today, priced per role by the operator. */
  setCosts: Record<string, number>;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(createPack, null);

  const sets = [
    { id: "full", label: t("Full game — 13 assets"), hint: t("Eleven symbols, background, lobby tile"), count: 13 },
    { id: "symbols", label: t("Symbols only — 11 assets"), hint: t("The paytable ladder, cut out on transparency"), count: 11 },
    { id: "scene", label: t("Scene — 3 assets"), hint: t("Background, lobby tile, reel frame"), count: 3 },
  ];

  return (
    <form action={action} className="panel" style={{ display: "grid", gap: "1.25rem" }}>
      <label style={{ display: "grid", gap: ".35rem" }}>
        <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)" }}>{t("Game")}</span>
        <input name="title" maxLength={120} placeholder={t("Tomb of the Scarab King")} required />
      </label>

      <label style={{ display: "grid", gap: ".35rem" }}>
        <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)" }}>{t("The world, in a sentence or two")}</span>
        <textarea
          name="brief"
          rows={3}
          maxLength={2000}
          required
          placeholder={t("An egyptian tomb at torchlight: carved limestone, gold leaf, beetles and dust. Warm and ominous, not cartoonish.")}
        />
      </label>

      <label style={{ display: "grid", gap: ".35rem" }}>
        <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)" }}>{t("Palette (optional)")}</span>
        <input name="palette" maxLength={300} placeholder={t("gold #E8B04B, limestone #D8CBB0, deep violet shadow")} />
      </label>

      <fieldset style={{ display: "grid", gap: ".5rem", border: 0, padding: 0, margin: 0 }}>
        <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)" }}>{t("What to make")}</span>
        {sets.map((s, i) => (
          <label key={s.id} style={{ display: "flex", gap: ".6rem", alignItems: "baseline" }}>
            <input type="radio" name="set" value={s.id} defaultChecked={i === 0} />
            <span>
              <strong>{s.label}</strong>
              <br />
              <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)" }}>
                {s.hint} · ${(setCosts[s.id] / 100).toFixed(2)}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {state?.error ? (
        <p role="alert" style={{ margin: 0, color: "var(--ink-2)" }}>{state.error}</p>
      ) : null}

      <div style={{ display: "flex", gap: ".75rem", alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? t("Ordering…") : t("Generate the set")}
        </button>
        <span className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>
          {t("Balance")} ${(balanceCents / 100).toFixed(2)}
        </span>
      </div>
    </form>
  );
}
