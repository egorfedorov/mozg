import "./test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { stubDb } from "./test-db";
import { pool } from "@/db";
import { referralTarget, payReferralCommission, visitorKey } from "./referral";
import { commissionCents } from "./money-math";

test("a referral link lands on the home page by default", () => {
  assert.equal(referralTarget(null, "ada"), "/?ref=ada");
  assert.equal(referralTarget("", "ada"), "/?ref=ada");
});

test("it can be pointed at a page here", () => {
  assert.equal(referralTarget("/explore", "ada"), "/explore?ref=ada");
  assert.equal(referralTarget("/b/mozg/tailwind", "ada"), "/b/mozg/tailwind?ref=ada");
  // A destination that already carries a query keeps it.
  assert.equal(referralTarget("/explore?price=free", "ada"), "/explore?price=free&ref=ada");
});

test("it cannot be pointed at anywhere else", () => {
  // The whole point of a link designed to be shared widely is that somebody
  // else chose to trust it. Every one of these must land at home instead.
  for (const hostile of [
    "//evil.com/x",
    "https://evil.com/x",
    "http://evil.com",
    "evil.com",
    "\\\\evil.com",
    "javascript:alert(1)",
  ]) {
    assert.equal(referralTarget(hostile, "ada"), "/?ref=ada", `escaped via ${hostile}`);
  }
});

test("an unknown handle is dropped rather than passed on", () => {
  assert.equal(referralTarget("/explore", null), "/explore");
  assert.equal(referralTarget(null, null), "/");
});

test("a handle is escaped on its way into the query", () => {
  assert.equal(referralTarget("/", "a b&c=d"), "/?ref=a%20b%26c%3Dd");
});

// ─── the money ──────────────────────────────────────────────────────────────

/** The one call payReferralCommission makes on the client, plus a recorder. */
function stubUser(row: object | null) {
  const moves: { userId: string; amount: number; kind: string }[] = [];
  stubDb((text, params) => {
    if (/select referred_by/.test(text)) return row ? [row] : [];
    if (/update "user" set balance_cents/.test(text)) {
      moves.push({
        userId: params[0] as string,
        amount: params[1] as number,
        kind: "",
      });
      return [{ balance_cents: params[1] }];
    }
    if (/insert into ledger/.test(text)) {
      moves[moves.length - 1].kind = params[2] as string;
      return [];
    }
    throw new Error(`unexpected query: ${text}`);
  });
  return moves;
}

// payReferralCommission wants a PoolClient and only ever calls .query on it.
// stubDb has already replaced pool.query with the handler above, so the pool
// itself is the shortest thing that behaves like the client under test.
const client = pool as never;

test("the referrer is paid a fifth of what was actually charged", async () => {
  const moves = stubUser({ referred_by: "ada", handle: "bob" });
  const paid = await payReferralCommission(client, {
    payerId: "bob-id",
    paidCents: 2500,
    note: "pro plan",
  });
  assert.equal(paid, commissionCents(2500));
  assert.deepEqual(moves, [{ userId: "ada", amount: 500, kind: "referral" }]);
});

test("no referrer means no movement at all", async () => {
  const moves = stubUser({ referred_by: null, handle: "bob" });
  assert.equal(
    await payReferralCommission(client, { payerId: "bob-id", paidCents: 2500, note: "pro" }),
    0,
  );
  assert.deepEqual(moves, []);
});

test("a free month writes nothing — move() refuses a zero", async () => {
  const moves = stubUser({ referred_by: "ada", handle: "bob" });
  // A 100% promo code buys the plan with no money moving.
  assert.equal(
    await payReferralCommission(client, { payerId: "bob-id", paidCents: 0, note: "pro" }),
    0,
  );
  // And a price so small the commission floors to nothing.
  assert.equal(
    await payReferralCommission(client, { payerId: "bob-id", paidCents: 4, note: "pro" }),
    0,
  );
  assert.deepEqual(moves, []);
});

test("referring yourself pays nobody", async () => {
  const moves = stubUser({ referred_by: "bob-id", handle: "bob" });
  assert.equal(
    await payReferralCommission(client, { payerId: "bob-id", paidCents: 2500, note: "pro" }),
    0,
  );
  assert.deepEqual(moves, []);
});

// ─── the visitor key ────────────────────────────────────────────────────────

test("a visitor cannot be followed between days or reversed", () => {
  const a = visitorKey("1.2.3.4", "Firefox", "2026-08-20");
  assert.equal(a, visitorKey("1.2.3.4", "Firefox", "2026-08-20"), "not stable within a day");
  assert.notEqual(a, visitorKey("1.2.3.4", "Firefox", "2026-08-21"), "followable across days");
  assert.notEqual(a, visitorKey("1.2.3.5", "Firefox", "2026-08-20"));
  assert.ok(/^[0-9a-f]{16}$/.test(a), "not an opaque short hash");
  assert.ok(!a.includes("1.2.3.4"));
});
