import "../lib/test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { examSize, negativeTarget } from "./exam";

test("exam size scales with the corpus, floored and capped", () => {
  assert.equal(examSize(0), 30); // empty brain still gets a real exam
  assert.equal(examSize(5), 30); // the old flat 30 survives for small brains
  assert.equal(examSize(750), 30); // exactly at the floor boundary
  assert.equal(examSize(1500), 60);
  assert.equal(examSize(3632), 100); // owasp-cheatsheets hits the cap
  assert.equal(examSize(100_000), 100);
});

test("anti-bluff share is a fifth, never fewer than three", () => {
  assert.equal(negativeTarget(30), 6);
  assert.equal(negativeTarget(100), 20);
  assert.equal(negativeTarget(10), 3); // floor beats the fifth on tiny exams
  assert.equal(negativeTarget(0), 3);
});
