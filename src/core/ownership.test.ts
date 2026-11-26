import { test } from "node:test";
import assert from "node:assert/strict";
import { STALE_LINES, moduleViews, ownershipOn, streakOf } from "./ownership";
import { lastPass, level, nextDueAt } from "./schedule";
import type { Change, Explain } from "./types";

const NOW = new Date(2026, 10, 25, 12);
const P = "/p";
const SOURCE = { path: "", offset: 0, length: 0 };

function at(dayOffset: number, hour = 10): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function ch(id: string, module: string, lines: number, when: string, weight = 1): Change {
  return {
    id, toolUseId: `t-${id}`, session: "s", project: P, file: `${module}/x.ts`, module, tool: "edit",
    at: when, added: lines, removed: 0, weight, risks: [], goAheadMs: 100, approvedBy: "auto", source: SOURCE,
  };
}

function ex(id: string, module: string, when: string, verdict: Explain["verdict"] = "explained"): Explain {
  return { id, change: `c-${id}`, project: P, module, question: "q", answer: "a", verdict, why: "", evidence: null, bug: null, at: when, examiner: "test" };
}

test("a module nobody explained is not owned", () => {
  const views = moduleViews(P, [ch("1", "payments", 40, at(0))], [], NOW);
  assert.equal(views[0].state, "unexplained");
  assert.equal(views[0].mode, "ask");
});

test("explaining a module makes it yours", () => {
  const changes = [ch("1", "payments", 40, at(0, 9))];
  const explains = [ex("e", "payments", at(0, 11))];
  const views = moduleViews(P, changes, explains, NOW);
  assert.equal(views[0].state, "explained");
  assert.equal(views[0].mode, "free");
  assert.equal(views[0].sinceExplained, 0);
});

test("a pass that did not pass does not count", () => {
  const views = moduleViews(P, [ch("1", "payments", 40, at(0, 9))], [ex("e", "payments", at(0, 11), "not_yet")], NOW);
  assert.equal(views[0].state, "unexplained");
});

test("the agent rewriting enough of a module takes it back", () => {
  const changes = [ch("1", "payments", 40, at(-3, 9)), ch("2", "payments", STALE_LINES, at(0, 9))];
  const explains = [ex("e", "payments", at(-1, 11))];
  const views = moduleViews(P, changes, explains, NOW);
  assert.equal(views[0].state, "changed");
  assert.equal(views[0].mode, "ask");
  assert.equal(views[0].sinceExplained, STALE_LINES);
  // Lines the agent changed before the pass do not count against it: the 40
  // from two days before the pass are not in the 100 that took it back.
  const small = moduleViews(P, [changes[0], ch("2", "payments", STALE_LINES - 1, at(0, 9))], explains, NOW);
  assert.equal(small[0].sinceExplained, STALE_LINES - 1);
  assert.notEqual(small[0].state, "changed");
});

test("an explained module comes back for a re-check", () => {
  const changes = [ch("1", "payments", 40, at(-2, 9))];
  const explains = [ex("e", "payments", at(-2, 11))];
  assert.equal(moduleViews(P, changes, explains, NOW)[0].state, "due");
  // Twenty-three hours after the pass it is still good.
  const sooner = new Date(NOW);
  sooner.setDate(sooner.getDate() - 1);
  sooner.setHours(10);
  assert.equal(moduleViews(P, changes, explains, sooner)[0].state, "explained");
});

test("only the project asked about is measured", () => {
  const other = { ...ch("9", "payments", 40, at(0)), project: "/other" };
  assert.deepEqual(moduleViews(P, [ch("1", "api", 10, at(0)), other], [], NOW).map((v) => v.module), ["api"]);
});

test("ownership is the risk-weighted share sitting in modules you can vouch for", () => {
  const changes = [
    ch("1", "payments", 100, at(0, 9), 2),
    ch("2", "api", 100, at(0, 9), 1),
    ch("3", "tests/x", 100, at(0, 9), 0.5),
  ];
  const explains = [ex("e", "api", at(0, 11))];
  const views = moduleViews(P, changes, explains, NOW);
  const today = at(0).slice(0, 10);
  const { owned, total, pct } = ownershipOn(today, P, changes, views);
  assert.equal(owned, 100);
  assert.equal(total, 350);
  assert.equal(pct, 29);
  assert.equal(ownershipOn("2026-01-01", P, changes, views).pct, null, "nothing changed that day");
});

test("the streak counts days with a pass, and a day off does not break it", () => {
  const e = (...days: number[]) => days.map((d, i) => ex(`e${i}`, "api", at(d, 11)));
  assert.deepEqual(streakOf([], NOW), { days: 0, best: 0 });
  assert.deepEqual(streakOf(e(0, -1, -2), NOW), { days: 3, best: 3 });
  // Nothing yet today: yesterday's run is still alive.
  assert.deepEqual(streakOf(e(-1, -2, -3), NOW), { days: 3, best: 3 });
  // Two days off, and it is a new run.
  assert.deepEqual(streakOf(e(-2, -3, -4), NOW), { days: 0, best: 3 });
  assert.deepEqual(streakOf(e(0, -3, -4, -5), NOW), { days: 1, best: 3 });
  // A miss is not a pass.
  const miss = ex("m", "api", at(0, 11), "not_yet");
  assert.deepEqual(streakOf([miss], NOW), { days: 0, best: 0 });
});

test("the ladder of passes lengthens the interval", () => {
  const one = [ex("a", "api", at(-1, 11))];
  assert.equal(level(one), 1);
  assert.equal(lastPass(one)?.id, "a");
  const day = 24 * 60 * 60 * 1000;
  assert.equal(Date.parse(nextDueAt(one)!.toISOString()), Date.parse(at(-1, 11)) + day);
  const two = [ex("a", "api", at(-4, 11)), ex("b", "api", at(-1, 11))];
  assert.equal(Date.parse(nextDueAt(two)!.toISOString()), Date.parse(at(-1, 11)) + 3 * day);
  // A miss starts the ladder over.
  const again = [...two, ex("m", "api", at(0, 9), "not_yet"), ex("c", "api", at(0, 11))];
  assert.equal(level(again), 1);
  assert.equal(level([ex("m", "api", at(0, 9), "not_yet")]), 0);
  assert.equal(nextDueAt([]), null);
});
