import { test } from "node:test";
import assert from "node:assert/strict";
import { findRegressions } from "./regressions";

test("a check that flipped pass -> fail is a regression", () => {
  assert.deepEqual(
    findRegressions(
      [{ check_id: "a", passed: true }],
      [{ check_id: "a", passed: false }],
    ),
    ["a"],
  );
});

test("a check that keeps failing is a known gap, not a regression", () => {
  assert.deepEqual(
    findRegressions(
      [{ check_id: "a", passed: false }],
      [{ check_id: "a", passed: false }],
    ),
    [],
  );
});

test("a new check failing on its first sitting has no history to regress from", () => {
  assert.deepEqual(
    findRegressions([], [{ check_id: "a", passed: false }]),
    [],
  );
});

test("recoveries and fresh passes are not regressions", () => {
  assert.deepEqual(
    findRegressions(
      [
        { check_id: "a", passed: false },
        { check_id: "b", passed: true },
      ],
      [
        { check_id: "a", passed: true },
        { check_id: "b", passed: true },
      ],
    ),
    [],
  );
});

test("only the flips are reported out of a mixed sitting", () => {
  assert.deepEqual(
    findRegressions(
      [
        { check_id: "a", passed: true },
        { check_id: "b", passed: true },
        { check_id: "c", passed: false },
      ],
      [
        { check_id: "a", passed: false },
        { check_id: "b", passed: true },
        { check_id: "c", passed: false },
      ],
    ),
    ["a"],
  );
});
