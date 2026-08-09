"use client";

import { useT } from "@/lib/t-client";
import { markup } from "@/lib/markup";
import { useActionState, useState } from "react";
import { addUrls } from "@/app/brains/[slug]/source-actions";
import { dismissGapSuggestion } from "@/app/brains/[slug]/exam-actions";
import { GAP_KIND_LABEL, type GapKind } from "@/lib/gap-kind";

/**
 * Gap suggestions (0043, kinds in 0055): every check the exam failed, with why
 * it failed. The why matters more than the question: only absent material is
 * fixed by adding a source, a thin note needs deepening, a ranking problem needs
 * the question's own words in the note, and a bluffed probe needs the brain to
 * cover *less*. Offering "add a source" for all four sent owners to buy pages
 * for problems pages do not fix.
 *
 * Nothing is ever added without the owner submitting the form.
 */
export default function GapSuggestions({
  slug,
  suggestions,
}: {
  slug: string;
  suggestions: { id: string; question: string; kind: GapKind }[];
}) {
  const t = useT();

  if (!suggestions.length) return null;
  return (
    <section style={{ marginTop: "2rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "1rem",
        }}
      >
        <h2 className="h2">{t("Gaps the exam keeps hitting")}</h2>
        <span className="eyebrow">
          {markup(
            suggestions.length === 1 ? t("<0/> suggestion") : t("<0/> suggestions"),
            [suggestions.length],
          )}</span>
      </div>
      <p style={{ color: "var(--ink-2)", marginTop: 0, maxWidth: "62ch" }}>
        {t("These questions were asked — by the exam or by real agents — and the brain got them wrong. Each says which kind of gap it is, because the fix differs: only the missing ones want a new source. Dismiss the ones not worth filling.")}</p>
      <div className="panel" style={{ padding: 0 }}>
        {suggestions.map((s) => (
          <GapRow key={s.id} slug={slug} suggestion={s} />
        ))}
      </div>
    </section>
  );
}

function GapRow({
  slug,
  suggestion,
}: {
  slug: string;
  suggestion: { id: string; question: string; kind: GapKind };
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [crawl, setCrawl] = useState(false);
  const [state, action, pending] = useActionState(addUrls, null);
  const added = typeof state?.added === "number" && state.added > 0;

  return (
    <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--rule)" }}>
      <div style={{ display: "flex", gap: "1rem", alignItems: "baseline" }}>
        <span style={{ flex: 1, fontSize: ".9375rem" }}>
          {suggestion.question}
          <span
            className="mono"
            style={{
              display: "block",
              fontSize: ".75rem",
              color: "var(--ink-3)",
              marginTop: ".25rem",
            }}
          >
            {suggestion.kind}: {GAP_KIND_LABEL[suggestion.kind]}
          </span>
        </span>
        {!added && (
          <span style={{ display: "flex", gap: "1rem", flexShrink: 0 }}>
            {suggestion.kind === "missing" && (
              <button className="mono" style={linkButton} onClick={() => setOpen((o) => !o)}>
                {open ? t("close") : t("add a source →")}
              </button>
            )}
            <form action={dismissGapSuggestion}>
              <input type="hidden" name="id" value={suggestion.id} />
              <input type="hidden" name="slug" value={slug} />
              <button className="mono" style={linkButton}>
                {t("dismiss")}
              </button>
            </form>
          </span>
        )}
      </div>

      {added ? (
        <p className="mono" style={{ fontSize: ".8125rem", margin: ".5rem 0 0", color: "var(--color-riso-green)" }}>
          {state?.site
            ? t("Reading the whole site — the exam re-runs when it lands.")
            : t("Queued — the exam re-runs when the page is read.")}
        </p>
      ) : (
        open && (
          <form action={action} style={{ display: "grid", gap: ".5rem", marginTop: ".75rem" }}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="suggestion" value={suggestion.id} />
            <label
              className="mono"
              style={{ display: "flex", gap: ".5rem", alignItems: "center", fontSize: ".8125rem" }}
            >
              <input
                type="checkbox"
                name="crawl"
                checked={crawl}
                onChange={(e) => setCrawl(e.target.checked)}
              />
              {t("Learn the whole site from one link")}
            </label>
            <textarea
              name="urls"
              rows={crawl ? 1 : 2}
              autoFocus
              required
              placeholder={
                crawl
                  ? "https://… the root of the docs that cover this"
                  : "https://… a page that answers this question"
              }
              style={{
                width: "100%",
                padding: ".55rem .7rem",
                border: "1.5px solid var(--ink)",
                background: "var(--paper)",
                font: "inherit",
                fontSize: ".875rem",
              }}
            />
            {state?.error && (
              <p className="mono" style={{ color: "var(--color-riso-red)", fontSize: ".8125rem", margin: 0 }}>
                {state.error}
              </p>
            )}
            {state?.refused?.length ? (
              <div className="mono" style={{ fontSize: ".75rem", color: "var(--color-riso-red)" }}>
                {state.refused.map((r) => (
                  <div key={r}>✕ {r}</div>
                ))}
              </div>
            ) : null}
            <button
              className="btn"
              disabled={pending}
              style={{ padding: ".4rem .8rem", justifySelf: "start" }}
            >
              {pending ? t("Adding…") : t("Add and re-examine")}
            </button>
          </form>
        )
      )}
    </div>
  );
}

const linkButton: React.CSSProperties = {
  background: "none",
  border: 0,
  padding: 0,
  color: "var(--ink-2)",
  fontSize: ".6875rem",
  cursor: "pointer",
  textDecoration: "underline",
};
