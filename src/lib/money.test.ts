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
  // $0.01 at a 30% fee is 0.3 cents of fee — it cannot be charged, so the
  // author keeps the whole cent rather than us keeping it.
  assert.equal(sellerShare(1), 1);
  assert.equal(sellerShare(10), 7);
  assert.equal(sellerShare(999), 999 - Math.floor(999 * PLATFORM_FEE_PERCENT / 100));
});

test("a round price splits the obvious way", () => {
  assert.equal(sellerShare(1000), 700); // $10 → $7
  assert.equal(sellerShare(500), 350); // $5 → $3.50
});

test("formatting is always two decimals", () => {
  assert.equal(formatCents(0), "$0.00");
  assert.equal(formatCents(5), "$0.05");
  assert.equal(formatCents(1000), "$10.00");
  assert.equal(formatCents(123456), "$1234.56");
});
