import { test } from "node:test";
import assert from "node:assert/strict";
import {
  effectivePlan,
  grantWindow,
  limitsFor,
  upgradesFrom,
  PLANS,
  PLAN_PRICE_CENTS,
  PLAN_PERIOD_DAYS,
} from "./plans";

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
  // Expired pro falls back to the free limits, write access included —
  // agent writes are open on every plan (see the free row in PLANS).
  const fallen = limitsFor("pro", "2020-01-01T00:00:00Z");
  assert.deepEqual(fallen, limitsFor("free"));
  assert.equal(fallen.write, true);
});

test("the price table matches the marketed prices", () => {
  assert.equal(PLAN_PRICE_CENTS.pro, 2500); // $25/mo
  assert.equal(PLAN_PRICE_CENTS.team, 7900); // $79/mo
  assert.ok(PLAN_PERIOD_DAYS >= 28, "a month of service must cover February");
});

test("a plan cannot include more inference than it costs", () => {
  // The bug this exists to prevent shipped once: Pro's only ceiling was $30 a
  // DAY, which is up to $900 a month of tokens sold for $25. Any future edit
  // that makes the included inference exceed the price fails here.
  for (const plan of ["pro", "team"] as const) {
    const price = PLAN_PRICE_CENTS[plan];
    const included = PLANS[plan].monthlyExtractCents;
    assert.ok(
      included < price,
      `${plan}: includes ${included}¢ of inference at a ${price}¢ price`,
    );
    // And the daily runaway guard must not be able to outrun the month either.
    assert.ok(PLANS[plan].dailyExtractCents * 30 > included, `${plan}: daily cap unreachable`);
    assert.ok(PLANS[plan].dailyExtractCents < included, `${plan}: a single day can eat the month`);
    // And the margin has to be real, not a rounding error: at least 15% of the
    // price stays with us to cover the embedder, the judge, storage and the box.
    assert.ok(
      price - included >= price * 0.15,
      `${plan}: margin is ${price - included}¢ of ${price}¢ — under 15%`,
    );
  }

  // Free gets a taste of our inference, not an allowance — and the daily cap must
  // not exceed the monthly one, or the trial becomes a monthly-renewing salary.
  assert.ok(PLANS.free.monthlyExtractCents > 0, "free should be able to try our AI once");
  assert.ok(PLANS.free.monthlyExtractCents <= 100, "a taste, not an allowance");
  assert.ok(PLANS.free.dailyExtractCents <= PLANS.free.monthlyExtractCents);
  // But it is not read-only — that is the point of the free tier.
  assert.equal(PLANS.free.write, true);
  assert.ok(PLANS.free.calls > 0);
});

test("export is the paid act — free reads over MCP, paid takes the file", () => {
  assert.equal(PLANS.free.exports, false);
  assert.equal(PLANS.pro.exports, true);
  assert.equal(PLANS.team.exports, true);
  // An expired paid plan loses export along with everything else.
  assert.equal(limitsFor("pro", "2020-01-01T00:00:00Z").exports, false);
});

/**
 * The tier that shipped unbuyable. `studio` existed in PLANS, its limits were
 * enforced, and the settings page offered ["pro", "team"] from a ternary
 * written before it — so nobody could pay for it. The ladder lives in one
 * place now; this is the check that it stays that way.
 */
test("every paid tier above the current one is offered, and admin is not sold to", () => {
  assert.deepEqual(upgradesFrom("free"), ["pro", "team"]);
  assert.deepEqual(upgradesFrom("pro"), ["team"]);
  assert.deepEqual(upgradesFrom("team"), []);
  assert.deepEqual(upgradesFrom("admin"), []);
  // Nothing is offered that has no price on it.
  for (const p of upgradesFrom("free")) assert.ok(PLAN_PRICE_CENTS[p] > 0);
});

/**
 * The operator's grant. What matters is not the happy path but that the date
 * is ALWAYS decided here — a grant that leaves a stale paid_until behind sets
 * the plan column and changes nothing, which is a silent failure the operator
 * cannot see from the table.
 */
test("a grant's window is decided for every plan, not only for timed ones", () => {
  assert.equal(grantWindow("pro", 3), "3 months");
  assert.equal(grantWindow("team", 12), "12 months");
  // No expiry — what a grant meant before a period existed.
  assert.equal(grantWindow("pro", 0), null);
  // Free never carries a date: effectivePlan ignores it and a reader would not.
  assert.equal(grantWindow("free", 12), null);
  // Junk from a form must not become an interval.
  assert.equal(grantWindow("pro", NaN), null);
  assert.equal(grantWindow("pro", -1), null);
  assert.equal(grantWindow("pro", 1.9), "1 months");
});

/** The silent failure this exists to stop, stated as a test. */
test("a lapsed date makes a paid plan serve as free", () => {
  const past = new Date("2026-01-01");
  const now = new Date("2026-08-25");
  assert.equal(effectivePlan("pro", past, now), "free");
  // Which is why a grant must clear it rather than leave it.
  assert.equal(effectivePlan("pro", grantWindow("pro", 0), now), "pro");
});
