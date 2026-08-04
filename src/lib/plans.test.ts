import { test } from "node:test";
import assert from "node:assert/strict";
import { effectivePlan, limitsFor, PLAN_PRICE_CENTS, PLAN_PERIOD_DAYS } from "./plans";

const NOW = new Date("2026-08-04T00:00:00Z");

test("free and admin never expire", () => {
  assert.equal(effectivePlan("free", null, NOW), "free");
  assert.equal(effectivePlan("admin", null, NOW), "admin");
  // Even with a stale paid_until left over from an earlier paid plan.
  assert.equal(effectivePlan("free", "2020-01-01T00:00:00Z", NOW), "free");
});

test("a paid plan lives until paid_until, then reads as free", () => {
  assert.equal(effectivePlan("pro", "2026-09-01T00:00:00Z", NOW), "pro");
  assert.equal(effectivePlan("team", "2026-08-04T00:00:01Z", NOW), "team");
  assert.equal(effectivePlan("pro", "2026-08-03T23:59:59Z", NOW), "free");
  assert.equal(effectivePlan("team", "2020-01-01T00:00:00Z", NOW), "free");
});

test("paid_until exactly now is already expired", () => {
  assert.equal(effectivePlan("pro", NOW.toISOString(), NOW), "free");
});

test("a hand-set paid plan (paid_until null) does not expire", () => {
  assert.equal(effectivePlan("pro", null, NOW), "pro");
  assert.equal(effectivePlan("team", undefined, NOW), "team");
});

test("expiry flows through to the limits", () => {
  assert.equal(limitsFor("pro", "2026-09-01T00:00:00Z").brains, 20);
  // Expired pro falls back to the free limits, write access included.
  const fallen = limitsFor("pro", "2020-01-01T00:00:00Z");
  assert.deepEqual(fallen, limitsFor("free"));
  assert.equal(fallen.write, false);
});

test("the price table matches the marketed prices", () => {
  assert.equal(PLAN_PRICE_CENTS.pro, 2500); // $25/mo
  assert.equal(PLAN_PRICE_CENTS.team, 9500); // $95/mo
  assert.ok(PLAN_PERIOD_DAYS >= 28, "a month of service must cover February");
});
