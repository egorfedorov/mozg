"use client";

import { useT } from "@/lib/t-client";
import { markup } from "@/lib/markup";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { gradeCard } from "./actions";
import { sectionGrade, type Grade } from "@/lib/learn";

export interface LessonItem {
  type: "read" | "recall" | "question";
  /** For read/recall: the note. For question: the check. */
  id: string;
  kind: "note" | "check";
  front: string;
  back: string;
  /** A section's own quiz question, asked right after the section ends. */
  quiz?: boolean;
  /** The connective text in other depths, when the lesson was compiled with them. */
  altBack?: { eli5?: string; expert?: string };
}

export type Depth = "standard" | "eli5" | "expert";

const DEPTH_KEY = "mozg:lesson-depth";
const DEPTHS: Depth[] = ["eli5", "standard", "expert"];

function savedDepth(): Depth {
  try {
    const d = localStorage.getItem(DEPTH_KEY);
    if (d === "eli5" || d === "expert") return d;
  } catch {}
  return "standard";
}

/** The stored depth never changes behind our back — the only writer is this
    component — so the subscription is a no-op and the value is read once per
    render instead of being copied into state by an effect. */
const noStoreUpdates = () => () => {};
const standardDepth = (): Depth => "standard";

/**
 * The lesson player. The mechanic is read-then-recall in small chunks:
 * a few notes are read, then the same notes come back title-first and the
 * learner tries to say the content before revealing it. Retrieval right
 * after reading is what moves material to long-term memory — re-reading
 * alone demonstrably does not. A section bound to exam questions closes with
 * one of them; the rest of the module's exam questions close the lesson.
 *
 * "Again" re-queues the item a few steps ahead, not at the end: relearning
 * works best moments later, while the miss still stings.
 *
 * Three extras on top of the bare mechanic:
 * - weak first: when the learner's history re-ranked the sections, a small
 *   marker says the hardest material is leading.
 * - depths: lessons compiled with eli5/expert variants get a depth switch;
 *   only the connective text (intro, section leads) changes, never the
 *   notes. The choice persists in localStorage.
 * - section grades: when the sitting ends, every section touched earns one
 *   aggregate grade from its cards' final grades, scheduling the section
 *   itself for re-reading.
 */
export default function LessonPlayer({
  brainId,
  items,
  backHref,
  nextHref,
  intro,
  adapted,
  sections,
}: {
  brainId: string;
  items: LessonItem[];
  backHref: string;
  nextHref: string | null;
  intro?: { standard: string; eli5?: string; expert?: string };
  adapted?: boolean;
  sections?: { key: string; itemIds: string[] }[];
}) {
  const t = useT();

  const [queue, setQueue] = useState(items);
  const [step, setStep] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [misses, setMisses] = useState(0);
  // Server render has no localStorage, so the saved depth arrives on the client
  // only; a pick during this sitting wins over it.
  const stored = useSyncExternalStore(noStoreUpdates, savedDepth, standardDepth);
  const [picked, setPicked] = useState<Depth | null>(null);
  const depth = picked ?? stored;
  // Each card's last grade this sitting — the evidence section grades are
  // aggregated from when the queue runs dry.
  const finalGrades = useRef<Record<string, Grade>>({});
  const sectionsGraded = useRef(false);
  const total = items.length;
  const item = queue[0];

  const hasDepths = Boolean(
    intro?.eli5 || intro?.expert || items.some((i) => i.altBack?.eli5 || i.altBack?.expert),
  );

  function pickDepth(d: Depth) {
    setPicked(d);
    try {
      localStorage.setItem(DEPTH_KEY, d);
    } catch {}
  }

  // The sitting is over: schedule the sections themselves. Only sections
  // whose cards were actually graded count, and each card's final grade is
  // the one that matters — an "again" that was later relearned to "good"
  // is a good.
  useEffect(() => {
    if (item || sectionsGraded.current || !sections?.length) return;
    sectionsGraded.current = true;
    const asked = new Set(items.map((i) => i.id));
    for (const s of sections) {
      const grades = s.itemIds
        .filter((id) => asked.has(id))
        .map((id) => finalGrades.current[id])
        .filter((g): g is Grade => Boolean(g));
      if (!grades.length) continue;
      void gradeCard({ brainId, kind: "section", itemId: s.key, grade: sectionGrade(grades) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  function advance() {
    setRevealed(false);
    setStep((s) => Math.min(s + 1, total));
    setQueue((q) => q.slice(1));
  }

  function grade(g: "again" | "good" | "easy") {
    const current = queue[0];
    finalGrades.current[current.id] = g;
    void gradeCard({ brainId, kind: current.kind, itemId: current.id, grade: g });
    if (g === "again") {
      setMisses((m) => m + 1);
      setRevealed(false);
      // Three steps ahead: soon, but not immediately — immediate repeats
      // test echo memory, not learning.
      setQueue((q) => {
        const [head, ...rest] = q;
        return [...rest.slice(0, 3), head, ...rest.slice(3)];
      });
      return;
    }
    advance();
  }

  // Keyboard: space reveals / confirms reading, 1-2-3 grade.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!item) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (item.type === "read") advance();
        else if (!revealed) setRevealed(true);
      }
      if (revealed && item.type !== "read") {
        if (e.key === "1") grade("again");
        if (e.key === "2") grade("good");
        if (e.key === "3") grade("easy");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, revealed]);

  if (!item) {
    return (
      <div style={{ border: "1.5px solid var(--ink)", background: "var(--paper-2)", padding: "2rem", textAlign: "center" }}>
        <p className="h2" style={{ margin: 0 }}>{t("Lesson done.")}</p>
        <p style={{ color: "var(--ink-2)" }}>
          {markup(t("<0/> steps<1/>. Everything you graded is now on a schedule — it comes back right before you would forget it."), [
          total,
          misses > 0 ? `, ${misses} relearned on the spot` : t(", clean run"),
        ])}</p>
        <span style={{ display: "inline-flex", gap: ".6rem" }}>
          {nextHref && <Link className="btn" href={nextHref}>{t("Next part →")}</Link>}
          <Link className={nextHref ? "btn btn-ghost" : "btn"} href={backHref}>
            {t("Back to the course")}</Link>
        </span>
      </div>
    );
  }

  const label =
    item.type === "read"
      ? "read"
      : item.type === "recall"
        ? "recall — say it before you look"
        : item.quiz
          ? "section quiz"
          : "exam question";

  const back = depth !== "standard" ? (item.altBack?.[depth] ?? item.back) : item.back;
  const introText =
    intro && depth !== "standard" ? (intro[depth] ?? intro.standard) : intro?.standard;

  return (
    <div>
      {introText && (
        <p className="lede" style={{ maxWidth: "62ch", marginTop: 0 }}>{introText}</p>
      )}
      {hasDepths && (
        <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", margin: "0 0 .75rem" }}>
          {markup(t("depth: <0/>"), [
          DEPTHS.map((d) => (
            <button
              key={d}
              onClick={() => pickDepth(d)}
              className="mono"
              style={{
                fontSize: ".75rem",
                background: "none",
                border: "none",
                padding: "0 .35rem",
                cursor: "pointer",
                color: d === depth ? "var(--ink)" : "var(--ink-3)",
                textDecoration: d === depth ? "underline" : "none",
                fontWeight: d === depth ? 700 : 400,
              }}
            >
              {d}
            </button>
          )),
        ])}</p>
      )}
      {/* One thin bar, always moving — finishing must feel near. */}
      <div style={{ height: 8, border: "1.5px solid var(--ink)", background: "var(--paper)", marginBottom: ".6rem" }}>
        <div style={{ height: "100%", width: `${Math.round((step / total) * 100)}%`, background: "var(--color-riso-green)", transition: "width .2s" }} />
      </div>
      <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", margin: "0 0 .75rem" }}>
        {step + 1} / {total} ·{" "}
        <span style={{ color: item.type === "read" ? "var(--ink-3)" : "var(--color-riso-red)" }}>{label}</span>
        {adapted && <span title={t("Sections you struggle with lead the lesson")}> {t("· weak first")}</span>}
      </p>

      <div style={{ border: "1.5px solid var(--ink)", background: "var(--paper-2)", padding: "1.5rem" }}>
        <p style={{ margin: 0, fontWeight: 650, fontSize: "1.125rem", whiteSpace: "pre-wrap" }}>{item.front}</p>
        {(item.type === "read" || revealed) && (
          <p
            style={{
              whiteSpace: "pre-wrap",
              color: "var(--ink-2)",
              lineHeight: 1.55,
              marginBottom: 0,
              ...(item.type === "read" ? { marginTop: ".75rem" } : { borderTop: "1px solid var(--rule)", paddingTop: "1rem" }),
            }}
          >
            {back}
          </p>
        )}
      </div>

      <div style={{ display: "flex", gap: ".6rem", marginTop: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        {item.type === "read" ? (
          <button className="btn" onClick={advance}>{t("Got it →")}</button>
        ) : !revealed ? (
          <button className="btn" onClick={() => setRevealed(true)}>{t("Show the answer")}</button>
        ) : (
          <>
            <button className="btn btn-ghost" style={{ borderColor: "var(--color-riso-red)" }} onClick={() => grade("again")}>
              {markup(t("again <0>1</0>"), [
              <span className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)" }} key="s0" />,
            ])}</button>
            <button className="btn btn-ghost" style={{ borderColor: "var(--color-riso-green)" }} onClick={() => grade("good")}>
              {markup(t("good <0>2</0>"), [
              <span className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)" }} key="s0" />,
            ])}</button>
            <button className="btn btn-ghost" onClick={() => grade("easy")}>
              {markup(t("easy <0>3</0>"), [
              <span className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)" }} key="s0" />,
            ])}</button>
          </>
        )}
        <span className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)", marginLeft: "auto" }}>
          {markup(t("space<0/>"), [
          item.type !== "read" && revealed ? " · 1 2 3" : "",
        ])}</span>
      </div>
    </div>
  );
}
