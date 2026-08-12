import "./test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { autoApprovable } from "./proposal-judge";

/**
 * The judgement itself needs a model, so it is exercised by
 * scripts/judge-proposals.ts against the real queue. What is pinned here is
 * the rule that decides whether a verdict may write into a brain people paid
 * for: both fields have to agree.
 */

test("a general note bound for the catalogue is taken", () => {
  assert.equal(autoApprovable({ general: true, belongs: "catalogue" }), true);
});

test("a project note is never taken, however sure the model sounds", () => {
  assert.equal(autoApprovable({ general: false, belongs: "own-project" }), false);
});

test("a verdict that contradicts itself decides nothing", () => {
  // One field says it travels, the other says it is theirs. A model that
  // cannot keep those two straight is not a model to hand a write path to.
  assert.equal(autoApprovable({ general: true, belongs: "own-project" }), false);
  assert.equal(autoApprovable({ general: false, belongs: "catalogue" }), false);
});
