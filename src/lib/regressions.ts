/**
 * What went stale: the diff between two exam sittings.
 *
 * A regression is a check that PASSED in the previous sitting and FAILS now —
 * the brain used to answer this and, after its sources moved, no longer does.
 * That is a different event from a check that simply keeps failing (a known
 * gap) or a new check failing on its first sitting (no history to regress
 * from), and it is the one the owner needs called out: a content update made
 * the brain worse at something it had already learned.
 *
 * Pure, so the worker's exam runner and its tests share one definition.
 */

export interface SittingVerdict {
  check_id: string;
  passed: boolean;
}

/** Check ids that flipped pass -> fail between the two sittings. */
export function findRegressions(
  prev: SittingVerdict[],
  cur: SittingVerdict[],
): string[] {
  const was = new Map(prev.map((v) => [v.check_id, v.passed]));
  return cur
    .filter((v) => !v.passed && was.get(v.check_id) === true)
    .map((v) => v.check_id);
}
