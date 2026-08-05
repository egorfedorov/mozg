import Link from "next/link";

/**
 * The brain, speaking for itself.
 *
 * A knowledge base is an abstraction until it tells you what it can do, and the
 * numbers on this page are read by nobody: a score, a count, a category tree.
 * Said in the first person — "I can answer questions about routing and loading;
 * I still fail four about dynamic routes" — the same numbers become a report
 * somebody actually reads before trusting it.
 *
 * The rule that makes this honest rather than a mascot with a marketing voice:
 * **every line comes from data on this page**. Categories it passes, categories
 * it fails, notes it holds, searches it answered, what its owner has not taught
 * it yet. Nothing is generated, nothing is inferred, nothing is encouraging for
 * the sake of it. A brain at 30% says so, and says which parts to distrust.
 */

export interface MascotFacts {
  title: string;
  score: number | null;
  notes: number;
  /** Categories the exam says it answers, strongest first. */
  strong: string[];
  /** Categories it currently fails every check in. */
  weak: string[];
  /** Sources read, and how many are still being read. */
  sourcesReady: number;
  sourcesPending: number;
  /** Searches served in the last seven days, from the metering table. */
  callsWeek: number;
  hasGoal: boolean;
}

/**
 * What it says, in order of what the reader needs. The first line is always its
 * current usefulness; the last is always the honest limit, because a report that
 * ends on a boast is an advert.
 */
function lines(f: MascotFacts): { text: string; tone?: "good" | "warn" }[] {
  const out: { text: string; tone?: "good" | "warn" }[] = [];

  if (!f.hasGoal) {
    out.push({ text: "I have no goal yet, so there is nothing to measure me against.", tone: "warn" });
    out.push({ text: "Give me one and I will write my own exam from it." });
    return out;
  }

  if (f.notes === 0) {
    out.push({ text: "I am empty. Feed me a documentation link or a folder and I will read it." });
    if (f.sourcesPending > 0) {
      out.push({ text: `${f.sourcesPending} source${f.sourcesPending === 1 ? "" : "s"} on the way — ask me again in a minute.` });
    }
    return out;
  }

  // Plurals, and the case a brain taught by an agent falls into: it holds notes
  // and has no sources at all, where "from 0 sources" reads like a fault.
  const noteWord = `${f.notes.toLocaleString()} note${f.notes === 1 ? "" : "s"}`;
  out.push({
    text: f.sourcesReady
      ? `I hold ${noteWord} from ${f.sourcesReady} source${f.sourcesReady === 1 ? "" : "s"}.`
      : `I hold ${noteWord}, taught to me directly rather than read from a source.`,
  });

  if (f.strong.length) {
    const list = f.strong.slice(0, 3).join(", ");
    out.push({ text: `Ask me about ${list} — I answer those.`, tone: "good" });
  }

  if (f.score !== null) {
    out.push({
      text:
        f.score >= 80
          ? `I passed ${f.score}% of my own exam, so trust me and still check the specifics.`
          : f.score >= 50
            ? `I passed ${f.score}% of my own exam. Useful, not authoritative — read my failures below.`
            : `I only passed ${f.score}% of my own exam. Treat me as a hint, not an answer.`,
      tone: f.score >= 80 ? "good" : "warn",
    });
  }

  if (f.weak.length) {
    out.push({
      text: `Do not trust me on ${f.weak.slice(0, 2).join(" or ")} — I fail every check there.`,
      tone: "warn",
    });
  }

  if (f.sourcesPending > 0) {
    out.push({ text: `${f.sourcesPending} more source${f.sourcesPending === 1 ? "" : "s"} is still being read; I will re-sit the exam after.` });
  }

  if (f.callsWeek > 0) {
    out.push({ text: `I answered ${f.callsWeek} search${f.callsWeek === 1 ? "" : "es"} this week.` });
  }

  return out;
}

/**
 * The face. A brain drawn the way the rest of the site draws things — one weight
 * of line, no gradients, no eyes that follow the cursor. It changes with the
 * score rather than being decorative: the folds fill in as the brain learns, so
 * the picture carries the same information as the number beside it.
 */
function Face({ score }: { score: number | null }) {
  const filled = score === null ? 0 : Math.round((score / 100) * 5);
  return (
    <svg
      viewBox="0 0 96 96"
      width="72"
      height="72"
      role="img"
      aria-label={score === null ? "A brain, not yet examined" : `A brain, ${score}% examined`}
      style={{ flex: "0 0 auto", color: "var(--ink)" }}
    >
      {/* the outline: two lobes and a stem */}
      <path
        d="M34 18c-9 0-15 6-15 13 0 3-4 4-4 9s4 7 4 10c0 8 7 13 15 13h4v9h6v-9h10c9 0 15-5 15-13 0-3 4-5 4-10s-4-6-4-9c0-7-6-13-15-13-3-4-8-6-12-6s-8 2-8 6z"
        fill="var(--paper)"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* the folds fill in with what it knows */}
      {[0, 1, 2, 3, 4].map((i) => (
        <path
          key={i}
          d={`M${26 + i * 2} ${30 + i * 9} q10 ${i % 2 ? -6 : 6} 22 0 q10 ${i % 2 ? 6 : -6} 18 0`}
          fill="none"
          stroke={i < filled ? "var(--color-riso-red)" : "currentColor"}
          strokeWidth={i < filled ? "2" : "1.2"}
          opacity={i < filled ? 0.9 : 0.28}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

export default function BrainMascot({ facts, slug }: { facts: MascotFacts; slug: string }) {
  const said = lines(facts);

  return (
    <section
      className="panel"
      aria-label="What this brain says about itself"
      style={{ display: "grid", gap: "1rem" }}
    >
      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
        <Face score={facts.score} />
        <div style={{ minWidth: 0 }}>
          <p className="eyebrow" style={{ margin: "0 0 .4rem" }}>
            {facts.title} says
          </p>
          <div style={{ display: "grid", gap: ".45rem" }}>
            {said.map((l, i) => (
              <p
                key={i}
                style={{
                  margin: 0,
                  fontSize: ".9375rem",
                  lineHeight: 1.5,
                  color:
                    l.tone === "warn"
                      ? "var(--ink)"
                      : l.tone === "good"
                        ? "var(--ink)"
                        : "var(--ink-2)",
                }}
              >
                {l.tone === "warn" && (
                  <span className="mono" style={{ color: "var(--color-riso-red)" }}>
                    !{" "}
                  </span>
                )}
                {l.tone === "good" && (
                  <span className="mono" style={{ color: "var(--color-riso-green)" }}>
                    ✓{" "}
                  </span>
                )}
                {l.text}
              </p>
            ))}
          </div>
        </div>
      </div>

      {/* Every claim above is checkable from this page, and this is where. */}
      <p className="mono" style={{ margin: 0, fontSize: ".75rem", color: "var(--ink-3)" }}>
        every line above is from this brain&apos;s own exam and metering —{" "}
        <Link className="linkish" href={`/brains/${slug}/board`}>
          see the working
        </Link>
      </p>
    </section>
  );
}
