/**
 * Ownership: what the agent changed, and how much of it a person can vouch for.
 *
 * Ownership is counted per module, not per line, because a person explains a
 * module and not a hunk. Explaining the riskiest change in `payments` makes
 * `payments` yours until the agent rewrites enough of it that the explanation
 * no longer describes the code.
 */

import { addDays, dayKey, daysBetween, lastDays } from "./time";
import { lastPass, nextDueAt } from "./schedule";
import { weightedLines } from "./change";
import type { Change, DayView, Explain, ModuleView } from "./types";

/** This many agent-changed lines since the last pass, and it is not yours. */
export const STALE_LINES = 100;
/** A change that went ahead faster than this gets the "no pause" label. */
export const NO_PAUSE_MS = 2000;

/** The states that still count as understood. */
const OWNED = new Set(["explained", "due"]);

function linesOf(c: Change): number {
  return weightedLines(c.added, c.removed, c.weight);
}

export function moduleViews(
  project: string,
  changes: Change[],
  explains: Explain[],
  now: Date,
): ModuleView[] {
  const today = dayKey(now);
  const byModule = new Map<
    string,
    { lines: number; weighted: number; changes: number; todayLines: number; todayUnattended: number; todayApproved: number; lastChangeAt: string | null; items: Change[] }
  >();
  for (const c of changes) {
    // A change that is only words is no module's to explain.
    if (c.project !== project || c.weight === 0) continue;
    const m = byModule.get(c.module) ?? { lines: 0, weighted: 0, changes: 0, todayLines: 0, todayUnattended: 0, todayApproved: 0, lastChangeAt: null, items: [] };
    const w = linesOf(c);
    m.weighted += w;
    m.changes++;
    m.lastChangeAt = m.lastChangeAt && m.lastChangeAt > c.at ? m.lastChangeAt : c.at;
    if (dayKey(new Date(c.at)) === today) {
      m.todayLines += c.added + c.removed;
      if (c.approvedBy === "auto") m.todayUnattended++;
      if (c.approvedBy === "user") m.todayApproved++;
    }
    m.items.push(c);
    byModule.set(c.module, m);
  }

  const out: ModuleView[] = [];
  for (const [module, m] of byModule) {
    const mine = explains.filter((e) => e.project === project && e.module === module);
    const pass = lastPass(mine);
    const since = pass
      ? m.items.filter((c) => c.at > pass.at).reduce((n, c) => n + c.added + c.removed, 0)
      : 0;
    const due = nextDueAt(mine);

    let state: ModuleView["state"];
    if (!pass) state = "unexplained";
    else if (since >= STALE_LINES) state = "changed";
    else if (due && due.getTime() <= now.getTime()) state = "due";
    else state = "explained";

    out.push({
      module,
      state,
      mode: !pass || state === "changed" ? "ask" : "free",
      lines: m.items.reduce((n, c) => n + c.added + c.removed, 0),
      weighted: m.weighted,
      changes: m.changes,
      todayLines: m.todayLines,
      todayUnattended: m.todayUnattended,
      todayApproved: m.todayApproved,
      lastChangeAt: m.lastChangeAt,
      lastExplainedAt: pass?.at ?? null,
      dueAt: due ? due.toISOString() : null,
      sinceExplained: since,
    });
  }
  return out.sort((a, b) => b.weighted - a.weighted || b.changes - a.changes || a.module.localeCompare(b.module));
}

/** How much of one day's change sits in modules the person can vouch for. */
export function ownershipOn(
  day: string,
  project: string,
  changes: Change[],
  views: ModuleView[],
): { owned: number; total: number; pct: number | null } {
  const state = new Map(views.map((v) => [v.module, v.state]));
  let owned = 0;
  let total = 0;
  for (const c of changes) {
    if (c.project !== project || dayKey(new Date(c.at)) !== day) continue;
    const w = linesOf(c);
    total += w;
    const s = state.get(c.module);
    if (s && OWNED.has(s)) owned += w;
  }
  return { owned, total, pct: total ? Math.round((owned / total) * 100) : null };
}

export function daysView(
  now: Date,
  n: number,
  project: string,
  changes: Change[],
  explains: Explain[],
  views: ModuleView[],
): DayView[] {
  return lastDays(now, n).map((day) => {
    const mine = changes.filter((c) => c.project === project && dayKey(new Date(c.at)) === day);
    const { pct } = ownershipOn(day, project, changes, views);
    return {
      day,
      ownership: pct,
      changes: mine.length,
      lines: mine.reduce((n, c) => n + c.added + c.removed, 0),
      explained: explains.filter((e) => e.project === project && e.verdict === "explained" && dayKey(new Date(e.at)) === day).length,
    };
  });
}

/**
 * Days in a row with at least one passed explain-back, ending today or
 * yesterday. A day without one does not take anything away: there is no freeze
 * to buy and nothing to lose, only a run that starts again.
 */
export function streakOf(explains: Explain[], now: Date): { days: number; best: number } {
  const days = new Set(
    explains.filter((e) => e.verdict === "explained").map((e) => dayKey(new Date(e.at))),
  );
  if (!days.size) return { days: 0, best: 0 };

  const noon = (key: string) => new Date(`${key}T12:00:00`);
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of [...days].sort()) {
    run = prev && daysBetween(noon(prev), noon(key)) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = key;
  }

  // Today, or yesterday if today has none yet: a run is not broken at breakfast.
  let cursor = startOf(now);
  if (!days.has(dayKey(cursor))) cursor = addDays(cursor, -1);
  let current = 0;
  while (days.has(dayKey(cursor))) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { days: current, best };
}

function startOf(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}
