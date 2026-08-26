import "@/lib/test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { closedScore, countDegraded, writtenChecks } from "./exam";

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

/**
 * The predicate that decides whether a sitting rewrites its exam first.
 *
 * `checks.origin` is `not null default 'generated'` — there is no such thing
 * as an origin-less check, so a test for one counts zero forever and every
 * sitting pays for a full regeneration. That shipped, and cost ~$11/day.
 */
test("auto-filed questions are not an exam, generated and manual ones are", () => {
  assert.equal(writtenChecks([{ origin: "generated" }, { origin: "manual" }]), 2);
  // The case that cost the money: a brain with a real exam must not read as
  // having none just because a search also filed a gap question against it.
  assert.equal(writtenChecks([{ origin: "generated" }, { origin: "usage" }]), 1);
  // And the case the origin test was added for: searched once, never examined.
  assert.equal(writtenChecks([{ origin: "usage" }, { origin: "search_gap" }]), 0);
  assert.equal(writtenChecks([]), 0);
});

/**
 * The rule that decides whether a DELTA gets published.
 *
 * A brain's headline number is score minus this one, so the failure to guard
 * against is a baseline measured on a subset: eight of ten questions answered
 * from the model's own knowledge, subtracted from ten questions answered with
 * the brain, would flatter every brain in the catalogue by exactly the share of
 * its control arm that failed to run.
 */
const c = (weight: number, closed_passed: boolean | null) => ({
  check: { weight, closed_passed },
});

test("closedScore refuses a baseline it did not measure in full", () => {
  assert.equal(closedScore([c(1, true), c(1, null)]), null);
  assert.equal(closedScore([]), null);
  // Every check measured, none passed closed-book: a real zero baseline, which
  // is the case that produces the largest honest delta. It must not read as
  // "unmeasured".
  assert.equal(closedScore([c(1, false), c(1, false)]), 0);
});

test("closedScore weights the control arm like the graded half", () => {
  // A central question the model already knows counts for more than a
  // peripheral one it does not.
  assert.equal(closedScore([c(5, true), c(1, false)]), 83);
  assert.equal(closedScore([c(1, true), c(1, false)]), 50);
  assert.equal(closedScore([c(3, true), c(3, true)]), 100);
});
