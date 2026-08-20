import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sellerShare,
  formatCents,
  PLATFORM_FEE_PERCENT,
  commissionCents,
  REFERRAL_PERCENT,
} from "./money-math";

test("the split never loses or invents a cent", () => {
  for (let price = 1; price <= 20000; price++) {
    const seller = sellerShare(price);
    const platform = price - seller;
    assert.equal(seller + platform, price, `split broke at ${price}`);
    assert.ok(seller >= 0 && platform >= 0, `negative side at ${price}`);
  }
});

test("rounding goes to the author, not to us", () => {
  // At a 5% fee, a fee under one whole cent cannot be charged — the author
  // keeps the whole amount rather than us keeping the fraction.
  assert.equal(sellerShare(1), 1);
  assert.equal(sellerShare(10), 10);
  assert.equal(sellerShare(999), 999 - Math.floor(999 * PLATFORM_FEE_PERCENT / 100));
});

test("a round price splits the obvious way", () => {
  assert.equal(sellerShare(1000), 950); // $10 → $9.50
  assert.equal(sellerShare(500), 475); // $5 → $4.75
});

test("formatting is always two decimals", () => {
  assert.equal(formatCents(0), "$0.00");
  assert.equal(formatCents(5), "$0.05");
  assert.equal(formatCents(1000), "$10.00");
  assert.equal(formatCents(123456), "$1234.56");
});

// ─── referral commission ────────────────────────────────────────────────────

test("commission is a fifth of what was actually charged", () => {
  assert.equal(commissionCents(2500), 500); // Pro, $25 → $5
  assert.equal(commissionCents(7900), 1580); // Team, $79 → $15.80
  // A founding account pays half, so the affiliate is paid on the half.
  assert.equal(commissionCents(1250), 250);
  assert.equal(commissionCents(3950), 790);
});

test("commission never invents money", () => {
  for (let paid = 0; paid <= 20000; paid++) {
    const cut = commissionCents(paid);
    assert.ok(cut >= 0, `negative commission at ${paid}`);
    assert.ok(cut <= paid, `commission exceeded the payment at ${paid}`);
    // Floored: never more than the stated percentage, never a fraction short
    // of a whole cent below it.
    assert.ok(cut <= (paid * REFERRAL_PERCENT) / 100, `over the rate at ${paid}`);
    assert.ok((paid * REFERRAL_PERCENT) / 100 - cut < 1, `lost a cent at ${paid}`);
  }
});

test("a free month pays nobody", () => {
  // A 100% promo code buys the plan with no money moving, and 20% of nothing
  // must not become a movement — move() rightly refuses a zero.
  assert.equal(commissionCents(0), 0);
  assert.equal(commissionCents(-100), 0);
});
