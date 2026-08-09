"use client";

import { useActionState } from "react";
import { useT } from "@/lib/t-client";
import { createStyleBrain } from "./style-actions";

const FIELDS: { key: string; label: string; hint: string; placeholder: string }[] = [
  {
    key: "palette",
    label: "Palette — the exact colours",
    hint: "Name them AND give values. Vague palettes examine terribly.",
    placeholder:
      "Warm cream paper #f2ead9, never pure white. Main ink: deep teal #1d4e4f. One accent per piece: vermilion #e34a33. Skin is always the paper itself with a rose tint…",
  },
  {
    key: "light",
    label: "Light & shading",
    hint: "How does a shadow actually look in your work?",
    placeholder:
      "Single light source, always upper-left. Shadows are one flat darker tone with a hard edge — no soft falloff. Highlights are left as unpainted paper…",
  },
  {
    key: "line",
    label: "Line & outline",
    hint: "Weight, tool, character. Or 'no outlines, shapes meet directly'.",
    placeholder:
      "Brush-pen outline, thick-to-thin, darkest brown not black. Interior lines half the weight. Lines break at highlights…",
  },
  {
    key: "texture",
    label: "Texture & materials",
    hint: "What do surfaces feel like? How do you treat metal, glass, fabric?",
    placeholder:
      "Everything carries dry-brush grain. Fabric gets loose hatching. Metal is flat tone plus one white bar — never a gradient…",
  },
  {
    key: "composition",
    label: "Composition habits",
    hint: "Framing, margins, where the eye goes first.",
    placeholder:
      "One subject, lots of air. Horizon low or absent. Small props orbit the subject, never behind it…",
  },
  {
    key: "subjects",
    label: "Typical subjects",
    hint: "What you draw and the way you draw it.",
    placeholder:
      "Animals in human situations. Faces minimal: dot eyes, no eyebrows. Hands are mittens, four fingers…",
  },
  {
    key: "nevers",
    label: "The hard nevers",
    hint: "The fastest way to spot a fake of your style.",
    placeholder:
      "Never smooth gradients. Never pure black. Never photorealistic texture. Never more than two inks per piece…",
  },
  {
    key: "references",
    label: "Where it comes from",
    hint: "Lineage helps an agent — and a buyer — place the style.",
    placeholder: "Riso zines, mid-century children's books, Blexbolex. Deliberately NOT corporate-flat…",
  },
];

export default function StyleForm() {
  const [state, action, pending] = useActionState(createStyleBrain, null);
  const t = useT();

  return (
    <form action={action} style={{ display: "grid", gap: "1.25rem", maxWidth: "44rem" }}>
      <label style={{ display: "grid", gap: ".3rem" }}>
        <span style={{ fontWeight: 600 }}>{t("Style name")}</span>
        <input
          name="name"
          required
          maxLength={80}
          placeholder={t("e.g. Ink & Paper Fables")}
          style={{ padding: ".65rem .8rem", border: "1.5px solid var(--ink)", background: "var(--paper)", font: "inherit" }}
        />
      </label>

      {FIELDS.map((f) => (
        <label key={f.key} style={{ display: "grid", gap: ".3rem" }}>
          <span style={{ fontWeight: 600 }}>{f.label}</span>
          <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)" }}>{f.hint}</span>
          <textarea
            name={f.key}
            rows={3}
            maxLength={2000}
            placeholder={f.placeholder}
            style={{ padding: ".65rem .8rem", border: "1.5px solid var(--ink)", background: "var(--paper)", font: "inherit", fontSize: ".9375rem" }}
          />
        </label>
      ))}

      {state?.error && (
        <p className="mono" style={{ color: "var(--color-riso-red)", fontSize: ".8125rem", margin: 0 }}>
          {state.error}
        </p>
      )}

      <div style={{ display: "flex", gap: ".75rem", alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn" disabled={pending}>
          {pending ? t("Building the brain…") : t("Create — then drop your works in")}
        </button>
        <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>
          {t(
            "every section optional — the next step is uploading artworks, and mozg writes the rules it sees in them",
          )}
        </span>
      </div>
    </form>
  );
}
