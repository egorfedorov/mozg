import "./test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { stubDb } from "./test-db";
import { contradictionsFor, facing } from "./contradictions";
import { duplicatePairs } from "./notes";

const ROW = {
  id: "c1",
  subject: "the RTP floor",
  claim_a: "the floor is 92%",
  claim_b: "the floor is 94%",
  note_a: "aaa",
  note_b: "bbb",
  title_a: "Payout floor",
  title_b: "Certification limits",
  brain_a: "Compliance",
  brain_b: "Stake Engine",
  slug_a: "slot-studio-compliance",
  slug_b: "stake-engine",
  handle_a: "mozg",
  handle_b: "mozg",
};

test("a conflict turns to face whichever note the reader is holding", async () => {
  stubDb(() => [ROW]);
  const [c] = await contradictionsFor(["aaa"]);

  const fromA = facing(c, "aaa");
  assert.equal(fromA?.mine.brain_slug, "slot-studio-compliance");
  assert.equal(fromA?.theirs.brain_slug, "stake-engine");
  assert.equal(fromA?.theirs.claim, "the floor is 94%");

  // The same row, entered from the other side: the sides must swap, or the
  // warning tells a reader their own brain is the one arguing with them.
  const fromB = facing(c, "bbb");
  assert.equal(fromB?.mine.brain_slug, "stake-engine");
  assert.equal(fromB?.theirs.claim, "the floor is 92%");

  assert.equal(facing(c, "somebody-else"), null);
});

test("no notes, no query — the search path asks on every hit list", async () => {
  stubDb(() => {
    throw new Error("must not query for an empty note list");
  });
  assert.deepEqual(await contradictionsFor([]), []);
});

test("crossBrain flips the pairing predicate and passes the whole scope", async () => {
  let seen: { text: string; params: unknown[] } | null = null;
  stubDb((text, params) => {
    seen = { text, params };
    return [];
  });

  await duplicatePairs(["b1", "b2"], { crossBrain: true });
  // The scope arrives as an array on both sides of the lateral join, and the
  // flag is what decides same-brain from cross-brain — a wrong parameter here
  // silently turns the contradiction pass back into a duplicate hunt.
  assert.deepEqual(seen!.params[0], ["b1", "b2"]);
  assert.equal(seen!.params[4], true);
  assert.match(seen!.text, /y\.brain_id <> x\.brain_id/);

  await duplicatePairs("b1");
  assert.deepEqual(seen!.params[0], ["b1"]);
  assert.equal(seen!.params[4], false);
});

test("skipped pairs are excluded before the limit, not after it", async () => {
  let seen: { text: string; params: unknown[] } | null = null;
  stubDb((text, params) => {
    seen = { text, params };
    return [];
  });

  await duplicatePairs(["b1", "b2"], {
    crossBrain: true,
    skipPairs: [
      ["n1", "n2"],
      ["n3", "n4"],
    ],
  });

  // Unzipped into two arrays for unnest, order preserved — pairing them up
  // wrongly would skip pairs nobody judged and re-judge the ones we did.
  assert.deepEqual(seen!.params[5], ["n1", "n3"]);
  assert.deepEqual(seen!.params[6], ["n2", "n4"]);
  // The exclusion has to sit above the limit in the query, or the budget is a
  // horizon: the same closest N return every run and pair N+1 never arrives.
  const where = seen!.text.indexOf("not exists");
  const limit = seen!.text.indexOf("limit $3");
  assert.ok(where > 0 && where < limit, "skip filter must precede the limit");

  // Callers that skip nothing send empty arrays, so their query is unchanged.
  await duplicatePairs("b1");
  assert.deepEqual(seen!.params[5], []);
});
