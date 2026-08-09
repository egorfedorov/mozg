"use client";

import { useT } from "@/lib/t-client";
import { markup } from "@/lib/markup";
import Link from "next/link";
import { useState } from "react";

export interface MindBrain {
  handle: string;
  title: string;
  goal: string | null;
  score: number | null;
  notes: number;
  callsWeek: number;
  access: "own" | "bought" | "added";
  tint: string;
  categories: string[];
  canAsk: string[];
  gaps: string[];
  href: string;
}

/**
 * The interactive half of "Your mind": one search box that filters across
 * titles, goals, categories and even the questions brains can answer — typing
 * "webhook" lights up every brain that knows about webhooks. The cards flip
 * open to show what each one can actually be asked.
 */
export default function MindMap({ brains }: { brains: MindBrain[] }) {
  const t = useT();

  const [q, setQ] = useState("");

  const needle = q.trim().toLowerCase();
  const match = (b: MindBrain) =>
    !needle ||
    [b.title, b.goal ?? "", ...b.categories, ...b.canAsk]
      .join(" ")
      .toLowerCase()
      .includes(needle);

  const shown = brains.filter(match);

  return (
    <>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("What do you need to know? — filters brains by everything they can answer")}
        style={{
          width: "100%",
          maxWidth: 560,
          padding: ".7rem .85rem",
          border: "1.5px solid var(--ink)",
          background: "var(--paper)",
          font: "inherit",
          fontSize: ".9375rem",
          marginBottom: "1.5rem",
        }}
      />
      {needle && (
        <p className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)", margin: "-1rem 0 1rem" }}>
          {markup(t("<0/> of <1/> brains know something about “<2/>”"), [
          shown.length,
          brains.length,
          q.trim(),
        ])}</p>
      )}

      <div
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        }}
      >
        {shown.map((b) => (
          <article
            key={b.handle}
            style={{
              border: "1.5px solid var(--ink)",
              background: "var(--paper-2)",
              display: "grid",
              gridTemplateRows: "auto 1fr auto",
            }}
          >
            <header
              style={{
                padding: ".7rem .9rem",
                borderBottom: "1px solid var(--rule)",
                display: "flex",
                gap: ".6rem",
                alignItems: "center",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 14,
                  height: 14,
                  flexShrink: 0,
                  background: `var(--color-riso-${b.tint})`,
                  border: "1.5px solid var(--ink)",
                }}
              />
              <strong style={{ flex: 1, fontSize: ".9375rem" }}>{b.title}</strong>
              {b.score !== null && (
                <span className="mono" style={{ fontSize: ".9375rem", fontWeight: 700 }}>
                  {b.score}%
                </span>
              )}
            </header>

            <div style={{ padding: ".7rem .9rem" }}>
              <p className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)", margin: "0 0 .5rem" }}>
                {markup(t("<0/> · <1/> notes <2/>"), [
                b.access,
                b.notes.toLocaleString(),
                b.callsWeek > 0 && ` · ${b.callsWeek} asks this week`,
              ])}</p>
              {b.categories.length > 0 && (
                <p style={{ margin: "0 0 .6rem", display: "flex", gap: ".35rem", flexWrap: "wrap" }}>
                  {b.categories.slice(0, 4).map((c) => (
                    <span key={c} className="mono" style={{ fontSize: ".6875rem", border: "1px solid var(--rule)", padding: ".1rem .4rem" }}>
                      {c}
                    </span>
                  ))}
                </p>
              )}

              {b.canAsk.length > 0 && (
                <details>
                  <summary className="mono" style={{ fontSize: ".75rem", cursor: "pointer", color: "var(--color-riso-green)" }}>
                    {t("✓ ask it things like…")}</summary>
                  <ul style={{ margin: ".4rem 0 0", paddingLeft: "1rem", fontSize: ".8125rem", color: "var(--ink-2)", display: "grid", gap: ".3rem" }}>
                    {b.canAsk.map((qq, i) => (
                      <li key={i}>{qq}</li>
                    ))}
                  </ul>
                </details>
              )}
              {b.gaps.length > 0 && (
                <p
                  className="mono"
                  style={{ margin: ".5rem 0 0", fontSize: ".6875rem", color: "var(--ink-3)" }}
                  title={t("Categories where the latest exam still fails — the brain keeps feeding itself here")}
                >
                  {markup(t("still learning: <0/>"), [
                  b.gaps.join(" · "),
                ])}</p>
              )}
            </div>

            <footer style={{ padding: ".55rem .9rem", borderTop: "1px solid var(--rule)" }}>
              <Link className="mono" style={{ fontSize: ".75rem", textDecoration: "underline" }} href={b.href}>
                {t("open →")}</Link>
              <span className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)", float: "right" }}>
                {markup(t("use <0/>"), [
                b.handle,
              ])}</span>
            </footer>
          </article>
        ))}
      </div>
    </>
  );
}
