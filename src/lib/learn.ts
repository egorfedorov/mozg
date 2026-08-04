/**
 * Scheduling for human learning — a compact SM-2. Three grades instead of
 * six: "again" (didn't know), "good" (knew), "easy" (knew cold). Research
 * beyond that granularity mostly tunes constants; three buttons is what a
 * person actually uses.
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
