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

/**
 * The other rule that decides what a score is about.
 *
 * A sitting runs for tens of minutes; regenerating the exam from the brain page
 * (or changing the goal) deletes every generated check and writes new ids. The
 * verdicts already in flight then point at questions that no longer exist, and
 * writing them threw a foreign key violation that killed the sitting after every
 * judge call was paid for — three times in three days on prod.
 */
test("verdicts for deleted questions are dropped, not written", async () => {
  const { stillAsked } = await import("./exam");
  const results = [{ check: { id: "a" } }, { check: { id: "b" } }, { check: { id: "c" } }];

  assert.equal(stillAsked(results, new Set(["a", "b", "c"])).length, 3);
  // One question deleted mid-sitting: the score is of the exam that remains.
  assert.deepEqual(
    stillAsked(results, new Set(["a", "c"])).map((r) => r.check.id),
    ["a", "c"],
  );
  // The whole exam rewritten — what "regenerate" actually does. Nothing survives,
  // and runExam fails the run rather than publishing 0% for a brain that answered
  // everything it was asked.
  assert.equal(stillAsked(results, new Set()).length, 0);
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
