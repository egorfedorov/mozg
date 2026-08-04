"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { gradeCard } from "./actions";

export interface LessonItem {
  type: "read" | "recall" | "question";
  /** For read/recall: the note. For question: the check. */
  id: string;
  kind: "note" | "check";
  front: string;
  back: string;
}

/**
 * The lesson player. The mechanic is read-then-recall in small chunks:
 * a few notes are read, then the same notes come back title-first and the
 * learner tries to say the content before revealing it. Retrieval right
 * after reading is what moves material to long-term memory — re-reading
 * alone demonstrably does not. Module exam questions close the lesson.
 *
 * "Again" re-queues the item a few steps ahead, not at the end: relearning
 * works best moments later, while the miss still stings.
 */
export default function LessonPlayer({
  brainId,
  items,
  backHref,
  nextHref,
}: {
  brainId: string;
  items: LessonItem[];
  backHref: string;
  nextHref: string | null;
}) {
  const [queue, setQueue] = useState(items);
  const [step, setStep] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [misses, setMisses] = useState(0);
  const total = items.length;
  const item = queue[0];

  function advance() {
    setRevealed(false);
    setStep((s) => Math.min(s + 1, total));
    setQueue((q) => q.slice(1));
  }

  function grade(g: "again" | "good" | "easy") {
    const current = queue[0];
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
        <p className="h2" style={{ margin: 0 }}>Lesson done.</p>
        <p style={{ color: "var(--ink-2)" }}>
          {total} steps{misses > 0 ? `, ${misses} relearned on the spot` : ", clean run"}.
          Everything you graded is now on a schedule — it comes back right
          before you would forget it.
        </p>
        <span style={{ display: "inline-flex", gap: ".6rem" }}>
          {nextHref && <Link className="btn" href={nextHref}>Next part →</Link>}
          <Link className={nextHref ? "btn btn-ghost" : "btn"} href={backHref}>
            Back to the course
          </Link>
        </span>
      </div>
    );
  }

  const label =
    item.type === "read"
      ? "read"
      : item.type === "recall"
        ? "recall — say it before you look"
        : "exam question";

  return (
    <div>
      {/* One thin bar, always moving — finishing must feel near. */}
      <div style={{ height: 8, border: "1.5px solid var(--ink)", background: "var(--paper)", marginBottom: ".6rem" }}>
        <div style={{ height: "100%", width: `${Math.round((step / total) * 100)}%`, background: "var(--color-riso-green)", transition: "width .2s" }} />
      </div>
      <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", margin: "0 0 .75rem" }}>
        {step + 1} / {total} ·{" "}
        <span style={{ color: item.type === "read" ? "var(--ink-3)" : "var(--color-riso-red)" }}>{label}</span>
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
            {item.back}
          </p>
        )}
      </div>

      <div style={{ display: "flex", gap: ".6rem", marginTop: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        {item.type === "read" ? (
          <button className="btn" onClick={advance}>Got it →</button>
        ) : !revealed ? (
          <button className="btn" onClick={() => setRevealed(true)}>Show the answer</button>
        ) : (
          <>
            <button className="btn btn-ghost" style={{ borderColor: "var(--color-riso-red)" }} onClick={() => grade("again")}>
              again <span className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)" }}>1</span>
            </button>
            <button className="btn btn-ghost" style={{ borderColor: "var(--color-riso-green)" }} onClick={() => grade("good")}>
              good <span className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)" }}>2</span>
            </button>
            <button className="btn btn-ghost" onClick={() => grade("easy")}>
              easy <span className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)" }}>3</span>
            </button>
          </>
        )}
        <span className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)", marginLeft: "auto" }}>
          space{item.type !== "read" && revealed ? " · 1 2 3" : ""}
        </span>
      </div>
    </div>
  );
}
