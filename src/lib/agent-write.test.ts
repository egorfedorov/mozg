import "./test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Brain } from "@/db/types";
import { writeNeedsReview } from "./agent-write";

const brain = (review_required: boolean): Brain =>
  ({ review_required }) as Brain;

test("the owner teaching their own brain never waits for review", () => {
  assert.equal(writeNeedsReview(brain(true), "owner"), false);
  assert.equal(writeNeedsReview(brain(false), "owner"), false);
});

test("review_required still gates outside writers", () => {
  assert.equal(writeNeedsReview(brain(true), "contributor"), true);
  assert.equal(writeNeedsReview(brain(false), "contributor"), false);
});
