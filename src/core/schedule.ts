/**
 * When an explained module comes back.
 *
 * A pass is worth more each time it holds: a day, then three, a week, two
 * weeks, a month. A "not yet" starts the ladder over, because the module was
 * not understood this time and tomorrow's question should not wait a month.
 */

import type { Explain } from "./types";

const INTERVALS = [1, 3, 7, 14, 30];

/** Passes in a row, ending at the latest explain. */
export function level(explains: Explain[]): number {
  const sorted = [...explains].sort((a, b) => a.at.localeCompare(b.at));
  let n = 0;
  for (let i = sorted.length - 1; i >= 0 && sorted[i].verdict === "explained"; i--) n++;
  return n;
}

/** The latest explain that passed, if any. */
export function lastPass(explains: Explain[]): Explain | null {
  const sorted = [...explains].sort((a, b) => a.at.localeCompare(b.at));
  for (let i = sorted.length - 1; i >= 0; i--) if (sorted[i].verdict === "explained") return sorted[i];
  return null;
}

export function nextDueAt(explains: Explain[]): Date | null {
  const pass = lastPass(explains);
  if (!pass) return null;
  const n = level(explains);
  const days = INTERVALS[Math.min(n, INTERVALS.length) - 1];
  return new Date(Date.parse(pass.at) + days * 24 * 60 * 60 * 1000);
}
