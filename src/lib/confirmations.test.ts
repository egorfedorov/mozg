import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmedAt } from "./confirmations";

test("a transfer matures exactly when txHeight + required reaches the tip", () => {
  // tx in block 100, 12 required: latest 111 is short, 112 is money.
  assert.equal(confirmedAt(100, 111, 12), false);
  assert.equal(confirmedAt(100, 112, 12), true);
  assert.equal(confirmedAt(100, 200, 12), true);
});

test("zero required means inclusion in the reference tip is enough", () => {
  // Tron: the tip is the solidified block, so 0 asks for a solid block only.
  assert.equal(confirmedAt(100, 100, 0), true);
  assert.equal(confirmedAt(100, 99, 0), false);
});

test("a tx above the tip is never confirmed, whatever the threshold", () => {
  assert.equal(confirmedAt(101, 100, 0), false);
  assert.equal(confirmedAt(101, 100, 50), false);
});

test("garbage heights never confirm", () => {
  assert.equal(confirmedAt(NaN, 100, 0), false);
  assert.equal(confirmedAt(100, NaN, 0), false);
  assert.equal(confirmedAt(Infinity, 100, 0), false);
});
