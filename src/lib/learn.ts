/**
 * Scheduling for human learning — a compact SM-2. Three grades instead of
 * six: "again" (didn't know), "good" (knew), "easy" (knew cold). Research
 * beyond that granularity mostly tunes constants; three buttons is what a
 * person actually uses.
 *
 * Kept dependency-free on purpose: the lesson player (a client component)
 * imports the pure helpers, so nothing node-only can live here.
 */

export interface CardState {
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
}

export type Grade = "again" | "good" | "easy";

export interface Scheduled extends CardState {
  /** Milliseconds from now until the card is due again. */
  dueInMs: number;
}

const DAY = 86_400_000;

export function schedule(s: CardState, grade: Grade): Scheduled {
  if (grade === "again") {
    // A lapse resets the interval but keeps most of the ease — one bad day
    // should not condemn a card to minimum-ease purgatory forever.
    return {
      intervalDays: 0,
      ease: Math.max(1.3, s.ease - 0.2),
      reps: s.reps + 1,
      lapses: s.lapses + 1,
      dueInMs: 10 * 60_000,
    };
  }

  const ease = grade === "easy" ? s.ease + 0.15 : s.ease;
  const intervalDays =
    s.intervalDays < 1
      ? grade === "easy"
        ? 3
        : 1
      : s.intervalDays * ease * (grade === "easy" ? 1.3 : 1);

  return {
    intervalDays,
    ease,
    reps: s.reps + 1,
    lapses: s.lapses,
    dueInMs: Math.round(intervalDays * DAY),
  };
}

/**
 * A learner's history with one card, reduced to what ranking needs. Rows
 * come straight from learn_progress; a card with no row is simply unknown,
 * which ranks as neither weak nor strong.
 */
export interface ProgressSignal {
  kind: "note" | "check";
  itemId: string;
  lapses: number;
  ease: number;
}

/**
 * How much a card struggles: every lapse counts, and ease lost below the
 * 2.5 starting point counts with it (ease only sinks on "again", so the two
 * move together). Ease won through "easy" is floored at zero — being strong
 * never makes a section negative-weak.
 */
function weakness(p: ProgressSignal): number {
  return Math.max(0, p.lapses) + Math.max(0, 2.5 - p.ease);
}

/**
 * Adaptive section order: sections whose notes/checks the learner keeps
 * missing come first, confident ones last. The sort is stable on the
 * original order, so a learner with no history — or an all-tied history —
 * gets the lesson exactly as the editor arranged it. `adapted` tells the UI
 * whether the order actually changed, so the "weak first" marker never
 * shows on the default arrangement.
 */
export function rankSections<S extends { note_ids: string[]; check_ids?: string[] }>(
  sections: S[],
  progress: ProgressSignal[],
): { sections: S[]; adapted: boolean } {
  const weakById = new Map<string, number>();
  for (const p of progress) weakById.set(p.itemId, weakness(p));
  const scored = sections.map((s, i) => ({
    s,
    i,
    w: [...s.note_ids, ...(s.check_ids ?? [])].reduce((n, id) => n + (weakById.get(id) ?? 0), 0),
  }));
  const ranked = [...scored].sort((a, b) => b.w - a.w || a.i - b.i);
  return { sections: ranked.map((r) => r.s), adapted: ranked.some((r, pos) => r.i !== pos) };
}

/**
 * One SM-2 grade for a whole section, aggregated from the grades its notes
 * and checks just earned: every card cold → easy; at least half known →
 * good; otherwise again. Called only with at least one grade — a section
 * nobody was asked about is not graded at all.
 */
export function sectionGrade(grades: Grade[]): Grade {
  if (!grades.length) return "again";
  if (grades.every((g) => g === "easy")) return "easy";
  const known = grades.filter((g) => g !== "again").length;
  return known / grades.length >= 0.5 ? "good" : "again";
}

/**
 * The duel on the course scoreboard: the learner wins when their learned
 * percent passes the brain's own exam score. Strictly greater — matching the
 * agent is a draw, not a win. A brain that never sat its exam cannot be
 * beaten, so there is nothing to chase yet.
 */
export function beatTheAgent(youPct: number, agentScore: number | null): boolean {
  return agentScore !== null && youPct > agentScore;
}

export type PathStatus = "done" | "current" | "locked";

/**
 * A family path reads like a course path: finished modules are done, the
 * first unfinished one is where the learner is, everything after waits.
 * "Locked" marks the path's reading order, never access — every link still
 * opens. Order is the caller's (the course page orders by title, matching
 * childrenOf in lib/families.ts).
 */
export function pathStatuses(pcts: number[]): PathStatus[] {
  let currentTaken = false;
  return pcts.map((pct) => {
    if (pct >= 100) return "done";
    if (!currentTaken) {
      currentTaken = true;
      return "current";
    }
    return "locked";
  });
}
