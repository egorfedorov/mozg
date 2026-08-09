import { translator } from "@/lib/t";
import { fill, markup } from "@/lib/markup";
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
function lines(
  f: MascotFacts,
  t: (english: string) => string,
): { text: string; tone?: "good" | "warn" }[] {
  const out: { text: string; tone?: "good" | "warn" }[] = [];

  if (!f.hasGoal) {
    out.push({ text: t("I have no goal yet, so there is nothing to measure me against."), tone: "warn" });
    out.push({ text: t("Give me one and I will write my own exam from it.") });
    return out;
  }

  if (f.notes === 0) {
    out.push({ text: t("I am empty. Feed me a documentation link or a folder and I will read it.") });
    if (f.sourcesPending > 0) {
      out.push({
        text: fill(
          f.sourcesPending === 1
            ? t("<0/> source on the way — ask me again in a minute.")
            : t("<0/> sources on the way — ask me again in a minute."),
          [f.sourcesPending],
        ),
      });
    }
    return out;
  }

  // Plurals, and the case a brain taught by an agent falls into: it holds notes
  // and has no sources at all, where "from 0 sources" reads like a fault.
  const noteWord = fill(
    f.notes === 1 ? t("<0/> note") : t("<0/> notes"),
    [f.notes.toLocaleString()],
  );
  out.push({
    text: f.sourcesReady
      ? fill(
          f.sourcesReady === 1
            ? t("I hold <0/> from <1/> source.")
            : t("I hold <0/> from <1/> sources."),
          [noteWord, f.sourcesReady],
        )
      : fill(t("I hold <0/>, taught to me directly rather than read from a source."), [noteWord]),
  });

  if (f.strong.length) {
    const list = f.strong.slice(0, 3).join(", ");
    out.push({ text: fill(t("Ask me about <0/> — I answer those."), [list]), tone: "good" });
  }

  if (f.score !== null) {
    out.push({
      text:
        f.score >= 80
          ? fill(t("I passed <0/>% of my own exam, so trust me and still check the specifics."), [f.score])
          : f.score >= 50
            ? fill(t("I passed <0/>% of my own exam. Useful, not authoritative — read my failures below."), [f.score])
            : fill(t("I only passed <0/>% of my own exam. Treat me as a hint, not an answer."), [f.score]),
      tone: f.score >= 80 ? "good" : "warn",
    });
  }

  if (f.weak.length) {
    out.push({
      text: fill(t("Do not trust me on <0/> — I fail every check there."), [
        f.weak.slice(0, 2).join(t(" or ")),
      ]),
      tone: "warn",
    });
  }

  if (f.sourcesPending > 0) {
    out.push({
      text: fill(
        f.sourcesPending === 1
          ? t("<0/> more source is still being read; I will re-sit the exam after.")
          : t("<0/> more sources are still being read; I will re-sit the exam after."),
        [f.sourcesPending],
      ),
    });
  }

  if (f.callsWeek > 0) {
    out.push({
      text: fill(
        f.callsWeek === 1
          ? t("I answered <0/> search this week.")
          : t("I answered <0/> searches this week."),
        [f.callsWeek],
      ),
    });
  }

  return out;
}

/**
 * The face: the drawn mascot, the same character as the one in the corner of every
 * page. It used to be an SVG whose folds filled in with the score — a nice idea
 * that looked like a diagram; the number is said in words two lines away, and the
 * character is worth more than the redundancy.
 */
function Face() {
  // Same reasoning as the dock's: fixed size, local, tiny, never resized.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/mascot.webp" alt="" width={72} height={72} style={{ flex: "0 0 auto" }} />;
}

export default async function BrainMascot({ facts, slug }: { facts: MascotFacts; slug: string }) {
  const t = await translator();

  const said = lines(facts, t);

  return (
    <section
      className="panel"
      aria-label={t("What this brain says about itself")}
      style={{ display: "grid", gap: "1rem" }}
    >
      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
        <Face />
        <div style={{ minWidth: 0 }}>
          <p className="eyebrow" style={{ margin: "0 0 .4rem" }}>
            {markup(t("<0/> says"), [
            facts.title,
          ])}</p>
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
        {markup(t("every line above is from this brain's own exam and metering — <0>see the working</0>"), [
        <Link className="linkish" href={`/brains/${slug}/board`} key="s0" />,
      ])}</p>
    </section>
  );
}
