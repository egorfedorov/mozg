import "@/lib/test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { countDegraded } from "./exam";

/**
 * The rule that decides whether a score gets published.
 *
 * This is the arithmetic behind the incident it exists to prevent: nextjs-api
 * scored 8/100 with every answer sitting in the brain, because the reranker was
 * contended and the judge was shown unranked candidates. Any check graded that
 * way makes the whole sitting unpublishable — a wrong score stays wrong on screen
 * until the next run, while a failed run costs nothing (the guard fires before
 * the first judge call) and gets re-queued.
 */

test("one degraded check is enough to refuse the sitting", () => {
  assert.equal(countDegraded([{ reranked: true }, { reranked: true }]), 0);
  assert.equal(countDegraded([{ reranked: true }, { reranked: false }]), 1);
  assert.equal(countDegraded([]), 0);
  // The whole run degraded — what a contended reranker actually looks like when
  // thirty retrievals fire at once, which is how the incident happened.
  assert.equal(countDegraded(Array.from({ length: 26 }, () => ({ reranked: false }))), 26);
});

test("a pass is carried on its evidence, not on a category label", async () => {
  const { carryable } = await import("./exam");

  // The bug this replaces: the check's category ("Rendering") was compared
  // against the categories of notes that moved ("scene graph"). Two
  // vocabularies that never match, so 543 new notes read as "nothing moved"
  // and a whole exam was carried for free, publishing 100% with no judge run.
  const evidence = ["note-a", "note-b"];

  assert.equal(carryable({ passed: true, evidence }, new Set()), true);
  // A note the verdict rested on was superseded — that verdict has to be re-won.
  assert.equal(carryable({ passed: true, evidence }, new Set(["note-b"])), false);
  // Failures are never carried: recovery has to stay possible.
  assert.equal(carryable({ passed: false, evidence }, new Set()), false);
  // No recorded evidence is not proof of anything.
  assert.equal(carryable({ passed: true, evidence: null }, new Set()), false);
  assert.equal(carryable({ passed: true, evidence: [] }, new Set()), false);
});
