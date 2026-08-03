import { test } from "node:test";
import assert from "node:assert/strict";
import { clustersFromPairs, type PairLike } from "./consolidate";

const pair = (a: string, b: string, distance: number): PairLike => ({
  a: { id: a },
  b: { id: b },
  distance,
});

test("a chain of pairs merges into one cluster", () => {
  // A≈B and B≈C must pull all three into one merge, or the run would merge
  // A+B and re-discover B's facts next time.
  const clusters = clustersFromPairs([pair("a", "b", 0.05), pair("b", "c", 0.08)], 10);
  assert.equal(clusters.length, 1);
  assert.deepEqual([...clusters[0]].sort(), ["a", "b", "c"]);
});

test("disjoint pairs stay separate clusters", () => {
  const clusters = clustersFromPairs([pair("a", "b", 0.05), pair("c", "d", 0.06)], 10);
  assert.equal(clusters.length, 2);
});

test("transitively merged notes appear in exactly one cluster", () => {
  const clusters = clustersFromPairs(
    [pair("a", "b", 0.02), pair("b", "c", 0.03), pair("a", "c", 0.04), pair("d", "e", 0.05)],
    10,
  );
  const all = clusters.flat().sort();
  assert.deepEqual(all, ["a", "b", "c", "d", "e"]);
});

test("the cap drops the loosest clusters, not arbitrary ones", () => {
  // duplicatePairs hands pairs over closest-first; the slice must keep them.
  const clusters = clustersFromPairs(
    [pair("a", "b", 0.01), pair("c", "d", 0.05), pair("e", "f", 0.09)],
    2,
  );
  assert.deepEqual(clusters, [["a", "b"], ["c", "d"]]);
});

test("empty input yields no clusters", () => {
  assert.deepEqual(clustersFromPairs([], 10), []);
});
