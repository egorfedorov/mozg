import { test } from "node:test";
import assert from "node:assert/strict";
import { schedule, rankSections, sectionGrade, beatTheAgent, pathStatuses, type CardState, type ProgressSignal } from "./learn";

const fresh: CardState = { intervalDays: 0, ease: 2.5, reps: 0, lapses: 0 };

test("a new card graduates through sane intervals", () => {
  const first = schedule(fresh, "good");
  assert.equal(first.intervalDays, 1);
  const second = schedule(first, "good");
  assert.equal(second.intervalDays, 2.5);
  assert.ok(second.dueInMs > 2 * 86_400_000);
});

test("again resets the interval but never floors ease below 1.3", () => {
  let s = schedule(fresh, "good");
  for (let i = 0; i < 20; i++) s = schedule(s, "again");
  assert.equal(s.intervalDays, 0);
  assert.equal(s.ease, 1.3);
  assert.equal(s.lapses, 20);
  // Due again in minutes, not days.
  assert.ok(s.dueInMs <= 10 * 60_000);
});

test("easy grows faster than good and never shrinks", () => {
  let good = schedule(fresh, "good");
  let easy = schedule(fresh, "easy");
  for (let i = 0; i < 5; i++) {
    good = schedule(good, "good");
    easy = schedule(easy, "easy");
    assert.ok(easy.intervalDays > good.intervalDays);
  }
});

const sections = [
  { heading: "A", note_ids: ["n1"], check_ids: ["c1"] },
  { heading: "B", note_ids: ["n2"] },
  { heading: "C", note_ids: ["n3"], check_ids: ["c2"] },
];

test("rankSections keeps the editor's order for a learner with no history", () => {
  const { sections: ranked, adapted } = rankSections(sections, []);
  assert.deepEqual(ranked.map((s) => s.heading), ["A", "B", "C"]);
  assert.equal(adapted, false);
});

test("rankSections leads with the sections the learner keeps missing", () => {
  const progress: ProgressSignal[] = [
    // c2 was lapsed twice and lost ease → section C is the weakest.
    { kind: "check", itemId: "c2", lapses: 2, ease: 2.1 },
    // n1 was lapsed once → section A is next.
    { kind: "note", itemId: "n1", lapses: 1, ease: 2.3 },
  ];
  const { sections: ranked, adapted } = rankSections(sections, progress);
  assert.deepEqual(ranked.map((s) => s.heading), ["C", "A", "B"]);
  assert.equal(adapted, true);
});

test("rankSections aggregates notes and checks, and strong ease never goes negative", () => {
  const progress: ProgressSignal[] = [
    { kind: "note", itemId: "n2", lapses: 0, ease: 3.5 }, // known cold — no weakness
    { kind: "note", itemId: "n3", lapses: 1, ease: 2.5 },
    { kind: "check", itemId: "c2", lapses: 1, ease: 2.5 }, // same section: 1 + 1
  ];
  const { sections: ranked } = rankSections(sections, progress);
  assert.deepEqual(ranked.map((s) => s.heading), ["C", "A", "B"]);
});

test("an all-tied history is not reported as adapted", () => {
  const progress: ProgressSignal[] = [
    { kind: "note", itemId: "n1", lapses: 1, ease: 2.5 },
    { kind: "note", itemId: "n2", lapses: 1, ease: 2.5 },
    { kind: "note", itemId: "n3", lapses: 1, ease: 2.5 },
  ];
  const { sections: ranked, adapted } = rankSections(sections, progress);
  assert.deepEqual(ranked.map((s) => s.heading), ["A", "B", "C"]);
  assert.equal(adapted, false);
});

test("sectionGrade: all easy is easy, half known is good, mostly missed is again", () => {
  assert.equal(sectionGrade(["easy", "easy"]), "easy");
  assert.equal(sectionGrade(["easy", "good"]), "good");
  assert.equal(sectionGrade(["again", "good"]), "good");
  assert.equal(sectionGrade(["again", "again", "good"]), "again");
  assert.equal(sectionGrade(["again"]), "again");
});

test("beatTheAgent: strictly above the exam score, and never against an unexamined brain", () => {
  assert.equal(beatTheAgent(81, 80), true);
  assert.equal(beatTheAgent(80, 80), false); // a draw is not a win
  assert.equal(beatTheAgent(40, 80), false);
  assert.equal(beatTheAgent(100, null), false);
});

test("pathStatuses: first unfinished module is current, the rest wait", () => {
  assert.deepEqual(pathStatuses([100, 100, 45, 0, 10]), ["done", "done", "current", "locked", "locked"]);
  assert.deepEqual(pathStatuses([100, 100]), ["done", "done"]);
  assert.deepEqual(pathStatuses([0]), ["current"]);
  assert.deepEqual(pathStatuses([]), []);
});
