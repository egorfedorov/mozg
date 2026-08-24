import "./test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { examTrend, trendLine } from "./exam-trend";
import { stubDb } from "./test-db";

/**
 * The real sittings these are built from, both of which printed as a decline:
 *
 *   slot-frontend-engineering  29 of 37 → 31 of 55   (answers MORE, shows −16)
 *   slot-mechanics-math        31 of 40 → 29 of 53   (answers the same, shows −22)
 *
 * Neither was a regression. The point of the split is that a reader can tell
 * that from the page instead of from a database.
 */

function stubRuns(
  now: [string, boolean][],
  before: [string, boolean][] | null,
) {
  stubDb((text, params) => {
    if (/from check_runs/.test(text)) {
      return before
        ? [
            { id: "now", started_at: new Date("2026-08-12") },
            { id: "before", started_at: new Date("2026-08-05") },
          ]
        : [{ id: "now", started_at: new Date("2026-08-12") }];
    }
    const rows = params[0] === "now" ? now : (before ?? []);
    return rows.map(([check_id, passed]) => ({ check_id, passed }));
  });
}

/** n checks, the first `pass` of them passing. */
const checks = (prefix: string, n: number, pass: number): [string, boolean][] =>
  Array.from({ length: n }, (_, i) => [`${prefix}${i}`, i < pass]);

test("answering more while the exam grows is not a decline", () => {
  // 29 of 37 → the same 37 plus 18 new, of which it answers 2.
  const before = checks("old", 37, 29);
  const now = [...checks("old", 37, 29), ...checks("new", 18, 2)];
  stubRuns(now, before);

  return examTrend("b").then((t) => {
    assert.ok(t);
    assert.equal(t.passed, 31);
    assert.equal(t.total, 55);
    assert.equal(t.regressed, 0, "nothing that worked stopped working");
    assert.equal(t.unanswered, 16);
    assert.match(trendLine(t)!.key, /more than last time/);
  });
});

test("a real regression is counted separately and named", () => {
  const before = checks("old", 10, 8);
  // Two that used to pass now fail; no new checks.
  const now: [string, boolean][] = checks("old", 10, 6);
  stubRuns(now, before);

  return examTrend("b").then((t) => {
    assert.equal(t!.regressed, 2);
    assert.equal(t!.unanswered, 0);
    assert.match(trendLine(t!)!.key, /fewer than last time/);
  });
});

test("learning an old failure counts as learned, not as noise", () => {
  const before = checks("old", 10, 4);
  const now = checks("old", 10, 7);
  stubRuns(now, before);
  return examTrend("b").then((t) => {
    assert.equal(t!.learned, 3);
    assert.equal(t!.regressed, 0);
  });
});

test("a first sitting has no trend and claims none", () => {
  stubRuns(checks("old", 12, 9), null);
  return examTrend("b").then((t) => {
    assert.equal(t!.passed, 9);
    assert.equal(t!.previous, null);
    assert.equal(trendLine(t!), null);
  });
});

test("a brain that never sat an exam returns nothing", () => {
  stubDb(() => []);
  return examTrend("b").then((t) => assert.equal(t, null));
});

/**
 * The anti-bluff split. Coverage and honesty are different failures with
 * different fixes, and on the catalogue's own numbers they diverge by
 * eighteen points — averaged into one percentage the weaker half disappears,
 * and it is the half that decides whether an agent can trust the answer.
 */
test("out-of-scope probes are reported apart from coverage", async () => {
  stubDb((text, params) => {
    if (/from check_runs/.test(text)) {
      return [{ id: "now", started_at: new Date("2026-08-24") }];
    }
    assert.match(text, /join checks/, "the split needs each result's kind");
    assert.equal(params[0], "now");
    return [
      { check_id: "c1", passed: true, kind: "positive" },
      { check_id: "c2", passed: true, kind: "positive" },
      { check_id: "c3", passed: false, kind: "positive" },
      // Three probes, one of which the brain bluffed its way through.
      { check_id: "n1", passed: true, kind: "negative" },
      { check_id: "n2", passed: true, kind: "negative" },
      { check_id: "n3", passed: false, kind: "negative" },
    ];
  });

  const t = await examTrend("b");
  assert.ok(t);
  // The probes stay inside the headline count — bluffing is a quality defect,
  // not a side metric — and are ALSO reported on their own.
  assert.equal(t.passed, 4);
  assert.equal(t.total, 6);
  assert.deepEqual(t.bluff, { refused: 2, probes: 3 });
});

test("a brain examined without probes claims no anti-bluff number", async () => {
  stubDb((text) => {
    if (/from check_runs/.test(text)) {
      return [{ id: "now", started_at: new Date("2026-08-24") }];
    }
    return [{ check_id: "c1", passed: true, kind: "positive" }];
  });

  const t = await examTrend("b");
  // Zero probes must read as "not measured", never as a perfect score — that
  // is the misreading the whole probe top-up exists to prevent.
  assert.deepEqual(t?.bluff, { refused: 0, probes: 0 });
});
