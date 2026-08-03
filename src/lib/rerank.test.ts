import { test } from "node:test";
import assert from "node:assert/strict";

// rerank.ts loads env at import time; clipDocument/applyRerank never open a
// connection, so a dummy DSN is all it takes to load the module.
process.env.DATABASE_URL ??= "postgres://localhost:5432/mozg-test";

const load = () => import("./rerank");

test("documents longer than the cap are clipped, shorter are untouched", async () => {
  const { clipDocument, MAX_DOC_CHARS } = await load();
  const long = "x".repeat(MAX_DOC_CHARS + 500);
  assert.equal(clipDocument(long).length, MAX_DOC_CHARS);
  const short = "короткий текст";
  assert.equal(clipDocument(short), short);
});

test("applyRerank reorders by score and keeps the top limit", async () => {
  const { applyRerank } = await load();
  const items = ["a", "b", "c"];
  const scores = [
    { index: 2, score: 0.9 },
    { index: 0, score: 0.5 },
    { index: 1, score: 0.1 },
  ];
  assert.deepEqual(applyRerank(items, scores, 3), ["c", "a", "b"]);
  assert.deepEqual(applyRerank(items, scores, 2), ["c", "a"]);
});

test("applyRerank does not trust the service to sort", async () => {
  const { applyRerank } = await load();
  const items = ["a", "b", "c"];
  // Same scores, delivered in ascending order — the client sorts, not the wire.
  const scores = [
    { index: 1, score: 0.1 },
    { index: 0, score: 0.5 },
    { index: 2, score: 0.9 },
  ];
  assert.deepEqual(applyRerank(items, scores, 3), ["c", "a", "b"]);
});

test("out-of-range and fractional indices are dropped, not fatal", async () => {
  const { applyRerank } = await load();
  const items = ["a", "b"];
  const scores = [
    { index: 5, score: 99 },
    { index: -1, score: 98 },
    { index: 1.5, score: 97 },
    { index: 1, score: 0.2 },
  ];
  assert.deepEqual(applyRerank(items, scores, 2), ["b"]);
});
