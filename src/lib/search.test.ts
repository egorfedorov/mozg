import { test } from "node:test";
import assert from "node:assert/strict";
import { toTsQuery } from "./tsquery";

test("natural-language questions OR their terms", () => {
  // The bug this replaced: plainto_tsquery ANDs everything, so a note had to
  // contain "how" and "are" to match. Every sentence query returned nothing.
  const q = toTsQuery("how long are transitions");
  assert.equal(q, "how:* | long:* | are:* | transitions:*");
});

test("punctuation is stripped, not passed to to_tsquery", () => {
  const q = toTsQuery("what's the card's border-radius?");
  assert.ok(q);
  assert.ok(!/[?'&!():]/.test(q.replace(/:\*/g, "")), `leaked punctuation: ${q}`);
});

test("single characters are dropped", () => {
  assert.equal(toTsQuery("a b padding"), "padding:*");
});

test("duplicates collapse", () => {
  assert.equal(toTsQuery("border border BORDER"), "border:*");
});

test("Cyrillic survives", () => {
  assert.equal(toTsQuery("отступы между секциями"), "отступы:* | между:* | секциями:*");
});

test("empty and noise-only input yields null", () => {
  assert.equal(toTsQuery(""), null);
  assert.equal(toTsQuery("   "), null);
  assert.equal(toTsQuery("!!! ??? ..."), null);
});

test("term count is capped", () => {
  const q = toTsQuery(Array.from({ length: 40 }, (_, i) => `word${i}`).join(" "));
  assert.ok(q);
  assert.equal(q.split("|").length, 12);
});
