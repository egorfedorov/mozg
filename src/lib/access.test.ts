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

/** Brain table + grants + seats + purchases, just enough for accessFor. */
function stubAccessDb(opts: {
  brains: Brain[];
  grants?: { brain_id: string; role: GrantRole; user_id: string }[];
  /** A studio seat. `lapsed` stands in for an expired paid_until. */
  seats?: { owner_id: string; role: GrantRole; user_id: string; lapsed?: boolean }[];
  purchases?: { brain_id: string; buyer_id: string }[];
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
    // Two different questions hit `members`. The stub treats a listed seat as
    // verified and its studio as paid unless the case says otherwise.
    // seatIn opens with `select m.role`; payingAccountsFor with `select
    // m.owner_id`. Both mention m.owner_id in their WHERE, so the select list
    // is what tells them apart.
    if (/select m\.owner_id/.test(text)) {
      // payingAccountsFor: every studio this person sits in. One param.
      return (opts.seats ?? [])
        .filter((m) => m.user_id === params[0])
        .map((m) => ({
          owner_id: m.owner_id,
          plan: "studio",
          paid_until: m.lapsed ? new Date(0) : null,
        }));
    }
    if (/from members/.test(text)) {
      // seatIn: does this person sit in THAT studio. Two params.
      const seat = (opts.seats ?? []).find(
        (m) => m.owner_id === params[0] && m.user_id === params[1],
      );
      return seat
        ? [{ role: seat.role, plan: "studio", paid_until: seat.lapsed ? new Date(0) : null }]
        : [];
    }
    if (/from purchases/.test(text)) {
      // buyer_id is matched against a LIST: a reader's own account plus any
      // studio whose seat they hold, because a purchase travels to its seats.
      const [brainIds, buyerIds] = params as [string[], string[]];
      return (opts.purchases ?? []).some(
        (p) => buyerIds.includes(p.buyer_id) && brainIds.includes(p.brain_id),
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

test("a studio seat opens every brain its owner has, without a per-brain grant", async () => {
  const b = brain({ visibility: "private" });
  stubAccessDb({
    brains: [b],
    seats: [{ owner_id: OWNER, role: "contributor", user_id: "user-colleague" }],
  });

  assert.deepEqual(await accessFor(b.id, "user-colleague"), {
    brain: b,
    access: "contributor",
    preview: false,
  });
  // Someone else's colleague is still a stranger.
  assert.deepEqual(await accessFor(b.id, STRANGER), { brain: b, access: null, preview: false });
});

test("a lapsed studio closes: the seat stops opening private brains", async () => {
  const b = brain({ visibility: "private" });
  stubAccessDb({
    brains: [b],
    seats: [{ owner_id: OWNER, role: "contributor", user_id: "user-colleague", lapsed: true }],
  });

  assert.deepEqual(await accessFor(b.id, "user-colleague"), {
    brain: b,
    access: null,
    preview: false,
  });
});

/**
 * The shape a pack sale actually has: the brains belong to whoever wrote them,
 * the studio owns none of them, and the only thing a colleague can inherit is
 * the receipt. Without this a five-seat plan sold access to nothing.
 */
test("a studio's purchase reaches the people holding its seats", async () => {
  const b = brain({ visibility: "public", price_cents: 24_900 });
  stubAccessDb({
    brains: [b],
    seats: [{ owner_id: "studio", role: "contributor", user_id: "user-colleague" }],
    purchases: [{ brain_id: b.id, buyer_id: "studio" }],
  });

  assert.deepEqual(await accessFor(b.id, "user-colleague"), {
    brain: b,
    access: "viewer",
    preview: false,
  });
  // Nobody else rides along on it.
  assert.deepEqual(await accessFor(b.id, STRANGER), { brain: b, access: null, preview: true });
});
