import { msg } from "@/lib/msg";
import { query } from "@/db";

/**
 * What changed between a brain's last two sittings, told honestly.
 *
 * The score is a percentage, and the exam only ever grows: a brain's own
 * material generates checks, and so do the questions real callers asked and
 * did not get answered. So the denominator moves, and a brain that improved
 * can post a lower number. This is not hypothetical — three brains did it in
 * one week:
 *
 *   slot-mechanics-math   31 of 40 (83%)  →  29 of 53 (61%)
 *   slot-frontend-eng     29 of 37 (77%)  →  31 of 55 (61%)
 *
 * The first answers two fewer questions out of thirteen more; the second
 * answers two MORE and still shows eighteen points less. Printing only the
 * percentage tells the reader "got worse" in both cases, and tells anyone who
 * contributes material that the system punishes them for it — which is fatal
 * for a catalogue that wants outside contributions.
 *
 * So the split below is the whole point, and it is the only honest one:
 *
 *   regressed  — checks that PASSED in the previous sitting and fail now.
 *                This is the only real decline, and it is usually zero.
 *   unanswered — checks that did not exist last time and fail now. The bar
 *                rose; nothing broke.
 *   learned    — checks that failed last time and pass now.
 *
 * Nothing new is collected for this: check_results has stored the per-check
 * outcome of every sitting since it existed.
 */

export interface ExamTrend {
  passed: number;
  total: number;
  /** Null on a brain that has only ever sat one exam. */
  previous: { passed: number; total: number; at: Date } | null;
  /** Passed before, fails now — the only genuine decline. */
  regressed: number;
  /** New since the last sitting and unanswered — the bar rising. */
  unanswered: number;
  /** Failed before, passes now. */
  learned: number;
}

export async function examTrend(brainId: string): Promise<ExamTrend | null> {
  const runs = await query<{ id: string; started_at: Date }>(
    `select id, started_at from check_runs
      where brain_id = $1 and status = 'done'
      order by started_at desc limit 2`,
    [brainId],
  );
  if (!runs.length) return null;

  const [latest, previous] = runs;

  const now = await query<{ check_id: string; passed: boolean }>(
    `select check_id, passed from check_results where run_id = $1`,
    [latest.id],
  );
  const passed = now.filter((r) => r.passed).length;

  if (!previous) {
    return { passed, total: now.length, previous: null, regressed: 0, unanswered: 0, learned: 0 };
  }

  const before = await query<{ check_id: string; passed: boolean }>(
    `select check_id, passed from check_results where run_id = $1`,
    [previous.id],
  );
  const was = new Map(before.map((r) => [r.check_id, r.passed]));

  let regressed = 0;
  let unanswered = 0;
  let learned = 0;
  for (const r of now) {
    const then = was.get(r.check_id);
    // A check the previous sitting never saw is new, however it goes now.
    if (then === undefined) {
      if (!r.passed) unanswered++;
      continue;
    }
    if (then && !r.passed) regressed++;
    else if (!then && r.passed) learned++;
  }

  return {
    passed,
    total: now.length,
    previous: {
      passed: before.filter((r) => r.passed).length,
      total: before.length,
      at: previous.started_at,
    },
    regressed,
    unanswered,
    learned,
  };
}

/**
 * The one sentence a reader needs under the percentage.
 *
 * Deliberately leads with the absolute count, because that is the number that
 * means what people think the percentage means. Whole sentences rather than
 * fragments assembled around variables — a translator handed "answers now, up
 * from" cannot make that a sentence in their language.
 */
export function trendLine(trend: ExamTrend): {
  key: string;
  values: (string | number)[];
} | null {
  if (!trend.previous) return null;
  const moved = trend.passed - trend.previous.passed;
  const grew = trend.total - trend.previous.total;

  if (grew > 0 && moved >= 0) {
    return {
      key: msg("It answers <0/> questions, <1/> more than last time, out of an exam that grew by <2/>."),
      values: [trend.passed, moved, grew],
    };
  }
  if (grew > 0) {
    return {
      key: msg("The exam grew by <0/> questions it has not learned yet. <1/> of the answers it had before have gone."),
      values: [grew, trend.regressed],
    };
  }
  if (moved > 0) {
    return { key: msg("It answers <0/> questions, <1/> more than last time."), values: [trend.passed, moved] };
  }
  if (moved < 0) {
    return {
      key: msg("It answers <0/> questions, <1/> fewer than last time."),
      values: [trend.passed, -moved],
    };
  }
  return { key: msg("It answers <0/> questions, the same as last time."), values: [trend.passed] };
}
