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

test("a note sent as one field is still a note", async () => {
  const { firstSentenceForTest } = await import("./agent-write");
  // Measured on production: half of every brain_write was rejected for
  // "both title and body are required" because models write the lesson as a
  // sentence and leave the other field empty.
  assert.equal(
    firstSentenceForTest("Use pnpm, never npm. The lockfile is committed."),
    "Use pnpm, never npm",
  );
  // No sentence end: clipped rather than dropped, and the clip is visible.
  const long = "x".repeat(140);
  const clipped = firstSentenceForTest(long);
  assert.ok(clipped.length <= 100, `${clipped.length} chars`);
  assert.ok(clipped.endsWith("…"));
  assert.equal(firstSentenceForTest("").length, 0);
});
