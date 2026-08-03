import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeCategory, topLevelCategory } from "./category";

test("case and spacing variants collapse to one category", () => {
  // The original bug: "Type scale" and "type scale" were two categories.
  assert.equal(normalizeCategory("Type scale"), "type scale");
  assert.equal(normalizeCategory("type scale"), "type scale");
  assert.equal(normalizeCategory("TYPE SCALE"), "type scale");
});

test("whitespace is trimmed and collapsed", () => {
  assert.equal(normalizeCategory("  spacing   and   layout  "), "spacing and layout");
});

test("hierarchy separators are tidied", () => {
  assert.equal(normalizeCategory("Typography / Scale"), "typography/scale");
  assert.equal(normalizeCategory("typography//scale"), "typography/scale");
  assert.equal(normalizeCategory("/typography/scale/"), "typography/scale");
});

test("empty and blank input yields null", () => {
  assert.equal(normalizeCategory(""), null);
  assert.equal(normalizeCategory("   "), null);
  assert.equal(normalizeCategory(null), null);
  assert.equal(normalizeCategory(undefined), null);
  assert.equal(normalizeCategory("/ /"), null);
});

test("overlong labels are capped at the schema's 80 chars", () => {
  assert.equal(normalizeCategory("x".repeat(200))!.length, 80);
});

test("topLevelCategory splits on the first slash", () => {
  assert.equal(topLevelCategory("typography/scale/modular"), "typography");
  assert.equal(topLevelCategory("spacing"), "spacing");
});
