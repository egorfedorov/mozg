import { test } from "node:test";
import assert from "node:assert/strict";
import { schedule, type CardState } from "./learn";

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
