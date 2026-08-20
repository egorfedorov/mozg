"use client";

import { useT } from "@/lib/t-client";
import { useActionState, useState } from "react";
import { newProject } from "@/app/gen/project-actions";

/**
 * The interview, opened rather than always sitting there.
 *
 * The old page put one big brief box in front of everybody, whether they had
 * eleven projects or none. A studio that already has work here wants the list
 * first and the form on request; a studio with none wants the form. One button
 * serves both without the page guessing.
 *
 * Three fields and no more. Everything else about the set — which symbols,
 * what each one is — is decided on the next screen where it can be seen as a
 * list, and where it is still free to change.
 */
/**
 * `kinds` arrives as a prop rather than an import, and that is load-bearing
 * rather than taste: lib/genproject reaches assetpacks, which reaches the
 * cutout, which is sharp — a native module with no business in a browser
 * bundle. The build refuses it, correctly. Pure data crossing the boundary as
 * a prop is the cheap way past that; a second module for one array is not.
 */
export default function ProjectStart({
  hasProjects,
  kinds,
}: {
  hasProjects: boolean;
  kinds: { id: string; set: string; title: string; note: string }[];
}) {
  const t = useT();

  const [open, setOpen] = useState(!hasProjects);
  const [state, action, pending] = useActionState(newProject, null);

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        {t("New project")}
      </button>
    );
  }

  return (
    <form action={action} className="panel" style={{ display: "grid", gap: "1rem" }}>
      <div>
        <p className="eyebrow" style={{ margin: 0 }}>
          {t("Step 1 of 2 · what are we making")}
        </p>
        <p style={{ color: "var(--ink-2)", margin: ".4rem 0 0", fontSize: ".9375rem", maxWidth: "62ch" }}>
          {t("Name it, say what it looks like, and pick what you are making. The next screen lists everything the set will hold — rewrite any of it, or leave it to the description. Nothing is charged until you generate.")}
        </p>
      </div>

      <label style={{ display: "grid", gap: ".35rem" }}>
        <span className="eyebrow">{t("The game")}</span>
        <input
          name="title"
          required
          maxLength={80}
          placeholder={t("Tomb of the Gilded Ibis")}
          style={field}
        />
      </label>

      <label style={{ display: "grid", gap: ".35rem" }}>
        <span className="eyebrow">{t("Its world — the shared half of every prompt")}</span>
        <textarea
          name="style"
          required
          rows={4}
          maxLength={4000}
          placeholder={t("A sun-bleached Egyptian tomb. Carved limestone, hot low light raking across the walls, gold leaf catching it. Painted, not photographic.")}
          style={{ ...field, resize: "vertical", lineHeight: 1.5 }}
        />
      </label>

      {/* What is being made, from the one list in lib/genproject.ts — so this
          cannot offer a kind the generator has no set for. "Something else" is
          the honest entry: an empty project rather than a category with no
          rules behind it. */}
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: ".5rem" }}>
        <span className="eyebrow">{t("What are you making")}</span>
        {kinds.map((k, i) => (
          <label
            key={k.set}
            className="panel"
            style={{ padding: ".7rem .85rem", display: "flex", gap: ".6rem", alignItems: "flex-start", cursor: "pointer" }}
          >
            <input type="radio" name="set" value={k.set} defaultChecked={i === 0} style={{ marginTop: ".25rem" }} />
            <span style={{ minWidth: 0 }}>
              <strong style={{ fontSize: ".9375rem" }}>{t(k.title)}</strong>
              <span className="mono" style={{ display: "block", fontSize: ".6875rem", color: "var(--ink-3)" }}>
                {t(k.note)}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <label style={{ display: "grid", gap: ".35rem" }}>
        <span className="eyebrow">{t("Palette — optional, and worth naming")}</span>
        <input
          name="palette"
          maxLength={300}
          placeholder={t("warm gold #E8B04B, deep lapis #1B3B6F, bone white")}
          style={field}
        />
      </label>

      <div style={{ display: "flex", gap: ".5rem", alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn" disabled={pending}>
          {pending ? t("Creating…") : t("Plan the set →")}
        </button>
        {hasProjects && (
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
            {t("Cancel")}
          </button>
        )}
        {state && "error" in state && state.error && (
          <span style={{ color: "var(--color-riso-red)", fontSize: ".875rem" }}>{state.error}</span>
        )}
      </div>
    </form>
  );
}

const field: React.CSSProperties = {
  width: "100%",
  fontSize: ".9375rem",
  padding: ".6rem .7rem",
  border: "1.5px solid var(--ink)",
  background: "var(--paper)",
  color: "var(--ink)",
  fontFamily: "inherit",
};
