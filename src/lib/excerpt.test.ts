import { test } from "node:test";
import assert from "node:assert/strict";
import { clipExcerpt, EXCERPT_CHARS } from "./excerpt";

test("short text passes through untouched", () => {
  const text = "Cards use a 12px radius.";
  assert.deepEqual(clipExcerpt(text), { text, clipped: false });
});

test("long text is cut at a sentence boundary, with an ellipsis", () => {
  const sentence = "The quick brown fox jumps over the lazy dog. ";
  const text = sentence.repeat(40); // ~1840 chars
  const { text: out, clipped } = clipExcerpt(text);
  assert.ok(clipped);
  assert.ok(out.endsWith("…"), out);
  assert.ok(out.length <= EXCERPT_CHARS + 2, `length ${out.length}`);
  // Cut after a full sentence, not mid-word.
  assert.ok(out.trimEnd().endsWith(". …") || out.trimEnd().endsWith("…"));
  assert.ok(out.includes("lazy dog."));
});

test("one very long sentence is hard-cut rather than returning nothing", () => {
  const text = "word ".repeat(400); // no sentence boundary at all
  const { text: out, clipped } = clipExcerpt(text);
  assert.ok(clipped);
  assert.ok(out.length > EXCERPT_CHARS / 2);
  assert.ok(out.endsWith("…"));
});

test("custom max is honoured", () => {
  const text = "One two. Three four. Five six. Seven eight nine ten eleven.";
  const { text: out, clipped } = clipExcerpt(text, 30);
  assert.ok(clipped);
  assert.equal(out, "One two. Three four. …");
});
