"use client";

import { useState } from "react";
import Link from "next/link";
import { gradeCard } from "./actions";

export interface Card {
  kind: "note" | "check";
  id: string;
  front: string;
  back: string;
  category: string | null;
  isNew: boolean;
}

const GRADES = [
  { grade: "again" as const, label: "again", hint: "didn't know", tint: "var(--color-riso-red)" },
  { grade: "good" as const, label: "good", hint: "knew it", tint: "var(--color-riso-green)" },
  { grade: "easy" as const, label: "easy", hint: "knew it cold", tint: "var(--color-riso-blue, var(--ink))" },
];

/**
 * One sitting: front → reveal → grade → next. Cards graded "again" rejoin
 * the end of this sitting's queue — a lapse is relearned today, not shipped
 * off to tomorrow.
 */
export default function Session({ brainId, cards, backHref }: { brainId: string; cards: Card[]; backHref: string }) {
  const [queue, setQueue] = useState(cards);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const [lapses, setLapses] = useState(0);

  const card = queue[0];

  if (!card) {
    return (
      <div style={{ border: "1.5px solid var(--ink)", background: "var(--paper-2)", padding: "2rem", textAlign: "center" }}>
        <p className="h2" style={{ margin: 0 }}>Sitting done.</p>
        <p style={{ color: "var(--ink-2)" }}>
          {done} card{done === 1 ? "" : "s"}, {lapses} relearned. The ones you
          missed come back sooner — that is the whole method.
        </p>
        <Link className="btn" href={backHref}>Back to the brain</Link>
      </div>
    );
  }

  async function grade(g: "again" | "good" | "easy") {
    const current = queue[0];
    setRevealed(false);
    setDone((d) => d + 1);
    if (g === "again") {
      setLapses((l) => l + 1);
      setQueue((q) => [...q.slice(1), { ...current, isNew: false }]);
    } else {
      setQueue((q) => q.slice(1));
    }
    // Fire-and-forget: a lost write costs one repetition, not the sitting.
    void gradeCard({ brainId, kind: current.kind, itemId: current.id, grade: g });
  }

  return (
    <div>
      <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>
        {queue.length} left
        {card.category ? ` · ${card.category}` : ""}
        {card.isNew ? " · new" : " · review"}
        {card.kind === "check" ? " · exam question" : ""}
      </p>

      <div style={{ border: "1.5px solid var(--ink)", background: "var(--paper-2)", padding: "1.5rem" }}>
        <p style={{ margin: 0, fontWeight: 650, fontSize: "1.125rem", whiteSpace: "pre-wrap" }}>{card.front}</p>
        {revealed && (
          <p style={{ whiteSpace: "pre-wrap", color: "var(--ink-2)", borderTop: "1px solid var(--rule)", paddingTop: "1rem", marginBottom: 0 }}>
            {card.back}
          </p>
        )}
      </div>

      <div style={{ display: "flex", gap: ".6rem", marginTop: "1rem", flexWrap: "wrap" }}>
        {!revealed ? (
          <button className="btn" onClick={() => setRevealed(true)}>
            Show the answer
          </button>
        ) : (
          GRADES.map((g) => (
            <button
              key={g.grade}
              className="btn btn-ghost"
              style={{ borderColor: g.tint }}
              onClick={() => grade(g.grade)}
            >
              {g.label}
              <span className="mono" style={{ fontSize: ".6875rem", marginLeft: ".5rem", color: "var(--ink-3)" }}>
                {g.hint}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
