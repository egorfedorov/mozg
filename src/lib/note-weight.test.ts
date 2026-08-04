import { test } from "node:test";
import assert from "node:assert/strict";

// note-weight.ts loads @/db, which validates process env at import time; the
// pure math under test never opens a connection, so a dummy DSN suffices.
process.env.DATABASE_URL ??= "postgres://localhost:5432/mozg-test";

const load = () => import("./note-weight");

test("no feedback is neutral", async () => {
  const { feedbackWeight } = await load();
  assert.equal(feedbackWeight(0, 0), 1.0);
});

test("positive feedback lifts, negative sinks", async () => {
  const { DOWN_STEP, feedbackWeight, UP_STEP } = await load();
  assert.equal(feedbackWeight(1, 0), 1 + UP_STEP);
  assert.equal(feedbackWeight(0, 1), 1 - DOWN_STEP);
  // A down-flag costs more than an up-flag earns — it was verified against
  // reality, an up-vote was not.
  assert.ok(DOWN_STEP > UP_STEP);
  assert.ok(feedbackWeight(1, 1) < 1.0);
});

test("positive feedback is capped, never dominant", async () => {
  const { feedbackWeight, WEIGHT_CEIL } = await load();
  assert.equal(feedbackWeight(100, 0), WEIGHT_CEIL);
});

test("negative feedback is floored, never silenced", async () => {
  const { feedbackWeight, WEIGHT_FLOOR } = await load();
  assert.equal(feedbackWeight(0, 100), WEIGHT_FLOOR);
});

test("mixed signals net out within the clamp", async () => {
  const { DOWN_STEP, feedbackWeight, UP_STEP, WEIGHT_CEIL } = await load();
  const w = feedbackWeight(4, 1);
  assert.equal(w, 1 + 4 * UP_STEP - DOWN_STEP);
  assert.ok(w > 1.0 && w <= WEIGHT_CEIL);
});

test("garbage counts degrade to neutral, not negative weights", async () => {
  const { feedbackWeight } = await load();
  assert.equal(feedbackWeight(-3, -3), 1.0);
});
