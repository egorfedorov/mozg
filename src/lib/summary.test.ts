import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAP_BATCH,
  MIN_SUMMARY_NOTES,
  SINGLE_PASS_LIMIT,
  staleSummaryCategories,
  summaryBatches,
  summaryNotesHash,
} from "./summary";

const note = (id: string, body = `body of ${id}`) => ({ id, title: `title ${id}`, body });

test("the hash is stable for the same notes and moves when they do", () => {
  const notes = [note("a"), note("b")];
  assert.equal(summaryNotesHash(notes), summaryNotesHash([note("a"), note("b")]));
  assert.notEqual(summaryNotesHash(notes), summaryNotesHash([note("a"), note("c")]));
  assert.notEqual(summaryNotesHash(notes), summaryNotesHash([note("a"), note("b"), note("c")]));
});

test("at or under the single-pass limit there is exactly one batch", () => {
  const notes = Array.from({ length: SINGLE_PASS_LIMIT }, (_, i) => note(`n${i}`));
  const batches = summaryBatches(notes);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, SINGLE_PASS_LIMIT);
});

test("past the limit the work splits into map batches", () => {
  const notes = Array.from({ length: SINGLE_PASS_LIMIT + 1 }, (_, i) => note(`n${i}`));
  const batches = summaryBatches(notes);
  assert.ok(batches.length > 1);
  assert.equal(batches[0].length, MAP_BATCH);
  // Every note is in exactly one batch — the map step must not drop material.
  assert.equal(batches.flat().length, notes.length);
});

test("a category with a moved hash recompiles; an unchanged one does not", () => {
  const current = [
    { category: "typography", hash: "h1", count: 10 },
    { category: "layout", hash: "h2-new", count: 5 },
  ];
  const existing = [
    { category: "typography", hash: "h1" },
    { category: "layout", hash: "h2-old" },
  ];
  const plan = staleSummaryCategories(current, existing);
  assert.deepEqual(plan.compile, ["layout"]);
  assert.deepEqual(plan.prune, []);
});

test("a new category with enough notes compiles; a tiny one does not", () => {
  const current = [
    { category: "big", hash: "h1", count: MIN_SUMMARY_NOTES },
    { category: "tiny", hash: "h2", count: MIN_SUMMARY_NOTES - 1 },
  ];
  const plan = staleSummaryCategories(current, []);
  assert.deepEqual(plan.compile, ["big"]);
  assert.deepEqual(plan.prune, []);
});

test("summaries of emptied or shrunk categories are pruned", () => {
  const current = [{ category: "shrunk", hash: "h1", count: MIN_SUMMARY_NOTES - 1 }];
  const existing = [
    { category: "shrunk", hash: "h1" },
    { category: "gone", hash: "h9" },
  ];
  const plan = staleSummaryCategories(current, existing);
  assert.deepEqual(plan.compile, []);
  assert.deepEqual(plan.prune.sort(), ["gone", "shrunk"]);
});
