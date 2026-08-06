import "./test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Brain } from "@/db/types";
import { writeNeedsReview } from "./agent-write";
import { canPropose, canWrite } from "./access";

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

// The safety argument for opening contributions is exactly this line: a reader
// may propose and may never write. If canPropose ever widens to someone
// canRead does not cover, or canWrite narrows to include a viewer, the whole
// "a stranger cannot change an answer" claim fails silently.
test("a reader may propose and may not write", () => {
  assert.equal(canPropose("viewer"), true);
  assert.equal(canWrite("viewer"), false);
});

test("no access proposes nothing", () => {
  assert.equal(canPropose(null), false);
  assert.equal(canWrite(null), false);
});
