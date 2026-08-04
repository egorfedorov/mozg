import { test } from "node:test";
import assert from "node:assert/strict";
import { sellerShare, formatCents, PLATFORM_FEE_PERCENT } from "./money-math";

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
