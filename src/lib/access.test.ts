import "./test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Brain, GrantRole } from "@/db/types";
import { accessFor } from "./access";
import { stubDb } from "./test-db";

const OWNER = "user-owner";
const STRANGER = "user-stranger";
const BUYER = "user-buyer";

let brainSeq = 0;
function brain(over: Partial<Brain>): Brain {
  brainSeq += 1;
  return {
    id: `brain-${brainSeq}`,
    owner_id: OWNER,
    slug: `brain-${brainSeq}`,
    title: `Brain ${brainSeq}`,
    goal: null,
    color: "#000000",
    topic: "other",
    parent_id: null,
    visibility: "private",
    license: "proprietary",
    score: null,
    score_at: null,
    score_closed: null,
    delta: null,
    review_required: false,
    contributions: true,
    cover_key: null,
    kind: "knowledge",
    note_count: 0,
    source_count: 0,
    price_cents: 0,
    sales_count: 0,
    created_at: new Date(0),
    updated_at: new Date(0),
    ...over,
  };
}

/** Brain table + grants + purchases + pack holdings, enough for accessFor. */
function stubAccessDb(opts: {
  brains: Brain[];
  grants?: { brain_id: string; role: GrantRole; user_id: string }[];
  purchases?: { brain_id: string; buyer_id: string }[];
  /** Packs this reader holds — bought, or seated on somebody's purchase. */
  packs?: { pack: string; user_id: string }[];
}) {
  stubDb((text, params) => {
    if (/select \* from brains where id/.test(text)) {
      const row = opts.brains.find((b) => b.id === params[0]);
      return row ? [row] : [];
    }
    if (/price_cents from brains where id/.test(text)) {
      const row = opts.brains.find((b) => b.id === params[0]);
      return row ? [{ id: row.id, price_cents: row.price_cents }] : [];
    }
    if (/from grants/.test(text)) {
      // The real query joins on the user's email and requires it verified;
      // the stub treats every listed grant as verified.
      const grant = (opts.grants ?? []).find(
        (g) => g.brain_id === params[0] && g.user_id === params[1],
      );
      return grant ? [{ role: grant.role }] : [];
    }
    if (/from pack_purchases/.test(text)) {
      // holdsAnyPack: does this reader hold any of these packs. The real query
      // folds "bought it" and "seated on it" into one EXISTS; the stub takes
      // the answer directly, since which of the two it was does not change
      // what access.ts does with it.
      const [userId, packs] = params as [string, string[]];
      return (opts.packs ?? []).some((h) => h.user_id === userId && packs.includes(h.pack))
        ? [{ "?column?": 1 }]
        : [];
    }
    if (/select slug from brains where id/.test(text)) {
      const row = opts.brains.find((b) => b.id === params[0]);
      return row ? [{ slug: row.slug }] : [];
    }
    if (/from purchases/.test(text)) {
      const [brainIds, buyerId] = params as [string[], string];
      return (opts.purchases ?? []).some(
        (p) => p.buyer_id === buyerId && brainIds.includes(p.brain_id),
      )
        ? [{ "?column?": 1 }]
        : [];
    }
    throw new Error(`unexpected query: ${text}`);
  });
}

test("unknown brain resolves to null", async () => {
  stubAccessDb({ brains: [] });
  assert.equal(await accessFor("brain-missing", OWNER), null);
});

test("private brain: owner is owner, everyone else gets nothing", async () => {
  const b = brain({ visibility: "private" });
  stubAccessDb({ brains: [b] });

  assert.deepEqual(await accessFor(b.id, OWNER), { brain: b, access: "owner", preview: false });
  assert.deepEqual(await accessFor(b.id, STRANGER), { brain: b, access: null, preview: false });
  assert.deepEqual(await accessFor(b.id, null), { brain: b, access: null, preview: false });
});

test("link brain: unlisted users get nothing, same as private", async () => {
  const b = brain({ visibility: "link" });
  stubAccessDb({ brains: [b] });

  assert.deepEqual(await accessFor(b.id, STRANGER), { brain: b, access: null, preview: false });
  assert.deepEqual(await accessFor(b.id, null), { brain: b, access: null, preview: false });
});

test("grants beat visibility: a private brain opens for its grantees", async () => {
  const b = brain({ visibility: "private" });
  stubAccessDb({
    brains: [b],
    grants: [
      { brain_id: b.id, role: "contributor", user_id: "user-contrib" },
      { brain_id: b.id, role: "viewer", user_id: "user-viewer" },
    ],
  });

  assert.deepEqual(await accessFor(b.id, "user-contrib"), {
    brain: b,
    access: "contributor",
    preview: false,
  });
  assert.deepEqual(await accessFor(b.id, "user-viewer"), {
    brain: b,
    access: "viewer",
    preview: false,
  });
});

test("public free brain: anyone is a viewer, even logged out", async () => {
  const b = brain({ visibility: "public", price_cents: 0 });
  stubAccessDb({ brains: [b] });

  assert.deepEqual(await accessFor(b.id, STRANGER), { brain: b, access: "viewer", preview: false });
  assert.deepEqual(await accessFor(b.id, null), { brain: b, access: "viewer", preview: false });
  assert.deepEqual(await accessFor(b.id, OWNER), { brain: b, access: "owner", preview: false });
});

test("public paid brain: no purchase means preview, not viewer", async () => {
  const b = brain({ visibility: "public", price_cents: 900 });
  stubAccessDb({ brains: [b] });

  assert.deepEqual(await accessFor(b.id, STRANGER), { brain: b, access: null, preview: true });
  assert.deepEqual(await accessFor(b.id, null), { brain: b, access: null, preview: true });
  // The owner and grantees never pay for their own brain.
  assert.deepEqual(await accessFor(b.id, OWNER), { brain: b, access: "owner", preview: false });
});

test("public paid brain: a buyer is a viewer", async () => {
  const b = brain({ visibility: "public", price_cents: 900 });
  stubAccessDb({ brains: [b], purchases: [{ brain_id: b.id, buyer_id: BUYER }] });

  assert.deepEqual(await accessFor(b.id, BUYER), { brain: b, access: "viewer", preview: false });
});

test("a paid parent covers its free children", async () => {
  const parent = brain({ visibility: "public", price_cents: 900 });
  const child = brain({ visibility: "public", price_cents: 0, parent_id: parent.id });
  stubAccessDb({
    brains: [parent, child],
    purchases: [{ brain_id: parent.id, buyer_id: BUYER }],
  });

  // No purchase: the child is gated by the parent's price.
  assert.deepEqual(await accessFor(child.id, STRANGER), {
    brain: child,
    access: null,
    preview: true,
  });
  // Buying the parent unlocks the child.
  assert.deepEqual(await accessFor(child.id, BUYER), {
    brain: child,
    access: "viewer",
    preview: false,
  });
});

/**
 * The shape a pack sale actually has. The brains belong to whoever wrote them
 * and the buyer owns none of them, so the only thing that can travel is the
 * receipt — and it has to travel to the seats, or a pack bought for a team is
 * a pack one person can read.
 *
 * "igaming" is a real pack slug from lib/packs.ts and "stake-engine" one of
 * its families; if either is renamed without the other, this fails, which is
 * the point of not making the slugs up here.
 */
test("a pack held opens the brains inside it, and nobody else's", async () => {
  const parent = brain({ visibility: "public", price_cents: 9900, slug: "stake-engine" });
  const child = brain({ visibility: "public", price_cents: 0, parent_id: parent.id });
  stubAccessDb({
    brains: [parent, child],
    packs: [
      { pack: "igaming", user_id: BUYER },
      // A seat on somebody else's purchase resolves the same way.
      { pack: "igaming", user_id: "user-colleague" },
    ],
  });

  for (const who of [BUYER, "user-colleague"]) {
    assert.deepEqual(await accessFor(parent.id, who), {
      brain: parent,
      access: "viewer",
      preview: false,
    });
    // The family comes with it: the child is gated by the parent's price.
    assert.deepEqual(await accessFor(child.id, who), {
      brain: child,
      access: "viewer",
      preview: false,
    });
  }

  assert.deepEqual(await accessFor(parent.id, STRANGER), {
    brain: parent,
    access: null,
    preview: true,
  });
});

test("a pack nobody holds leaves the paywall exactly where it was", async () => {
  const b = brain({ visibility: "public", price_cents: 9900, slug: "stake-engine" });
  stubAccessDb({ brains: [b], packs: [{ pack: "igaming", user_id: "someone-else" }] });

  assert.deepEqual(await accessFor(b.id, BUYER), { brain: b, access: null, preview: true });
});
