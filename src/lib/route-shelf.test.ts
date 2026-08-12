import "./test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { shelfFor, type ShelfBrain } from "./route-shelf";
import { stubDb } from "./test-db";
import type { WorkflowStep } from "./workflows";

/**
 * Every case here is a way the three callers of shelfFor used to disagree —
 * the page said one thing, the buy button charged another, and the agent
 * refused for a third reason. The stub answers the two queries the function
 * makes: the brain rows (with `held` already folded in, as the SQL does) and
 * the reader's packs.
 */

let seq = 0;
function row(over: Partial<ShelfBrain> & { held?: boolean }): ShelfBrain {
  seq += 1;
  return {
    id: `b${seq}`,
    slug: `brain-${seq}`,
    title: `Brain ${seq}`,
    owner_id: "someone",
    owner_handle: "someone",
    score: null,
    price_cents: 0,
    note_count: 10,
    child_notes: 0,
    parent_slug: null,
    shelved: false,
    held: true,
    ...over,
  };
}

function stub(rows: ShelfBrain[], packs: string[] = []) {
  stubDb((text, params) => {
    if (/from pack_purchases/.test(text)) return packs.map((p) => ({ pack: p, buyer_id: params[0], own: true }));
    const slugs = params[0] as string[];
    return rows.filter((r) => slugs.includes(r.slug.toLowerCase()));
  });
}

const steps = (...brains: string[]): WorkflowStep[] =>
  brains.map((b, i) => ({ title: `step ${i}`, brain: b }));

test("a paid brain nobody bought keeps the route closed and is priced", async () => {
  stub([row({ slug: "paid", price_cents: 1900, held: false })]);
  const shelf = await shelfFor(steps("mozg/paid"), "reader");
  assert.equal(shelf.ready, false);
  assert.deepEqual(shelf.missing.map((b) => b.slug), ["paid"]);
});

test("a brain opened by a pack is not missing and not charged for", async () => {
  // pixijs-casino is in the igaming pack; see lib/packs.ts.
  stub([row({ slug: "pixijs-casino", price_cents: 1900, held: false })], ["igaming"]);
  const shelf = await shelfFor(steps("mozg/pixijs-casino"), "reader");
  assert.equal(shelf.ready, true);
  assert.deepEqual(shelf.missing, []);
});

test("a family member is reached through its parent's pack membership", async () => {
  stub(
    [row({ slug: "stake-engine-rgs-api", parent_slug: "stake-engine", price_cents: 1900, held: false })],
    ["igaming"],
  );
  assert.equal((await shelfFor(steps("mozg/stake-engine-rgs-api"), "reader")).ready, true);
});

test("a step naming a brain nothing answers to keeps the route closed", async () => {
  // The bug: the page said "Ready" because the row never came back, while the
  // agent refused — and the reader could not see which of them was lying.
  stub([]);
  const shelf = await shelfFor(steps("mozg/renamed-last-month"), "reader");
  assert.equal(shelf.ready, false);
  assert.deepEqual(shelf.unknown, ["mozg/renamed-last-month"]);
  assert.deepEqual(shelf.missing, []);
});

test("a free brain not yet shelved is open, and never a blocker", async () => {
  stub([row({ slug: "free", price_cents: 0, held: true, shelved: false })]);
  const shelf = await shelfFor(steps("free"), "reader");
  assert.equal(shelf.ready, true);
  assert.deepEqual(shelf.unshelved.map((b) => b.slug), ["free"]);
});

test("one slug under two owners is counted once, the named one winning", async () => {
  // Matching on slug alone listed the row twice and priced the route twice.
  stub([
    row({ slug: "pixijs-casino", owner_handle: "impostor", price_cents: 1900, held: false, score: 90 }),
    row({ slug: "pixijs-casino", owner_handle: "mozg", price_cents: 1900, held: false, score: 60 }),
  ]);
  const shelf = await shelfFor(steps("mozg/pixijs-casino"), "reader");
  assert.equal(shelf.brains.length, 1);
  assert.equal(shelf.brains[0].owner_handle, "mozg");
});

test("the same brain named by two steps is one row, not two", async () => {
  stub([row({ slug: "paid", price_cents: 1900, held: false })]);
  const shelf = await shelfFor(steps("mozg/paid", "paid"), "reader");
  assert.equal(shelf.brains.length, 1);
  assert.equal(shelf.missing.length, 1);
});

test("a route naming no brains is ready and asks nobody for money", async () => {
  stub([]);
  const shelf = await shelfFor([{ title: "run the build" }], "reader");
  assert.equal(shelf.ready, true);
  assert.deepEqual(shelf.brains, []);
});
