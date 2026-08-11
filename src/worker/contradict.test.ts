import "../lib/test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { sameClaim } from "./contradict";

/**
 * The filter has to fail in one direction only. Letting an echo through costs
 * the pack page its credibility once; dropping a real conflict costs an agent
 * a wrong answer every time it asks. So the true-conflict cases below matter
 * more than the echo ones, and each is a shape the judge actually produces.
 */

test("one side merely said more fully is not a disagreement", () => {
  // Verbatim from /packs/igaming, which printed this as a conflict.
  assert.equal(
    sameClaim(
      "The run_freespin() function is used in sample games but is not required if the game does not contain a free-spin entry from the base-game.",
      "The run_freespin() function is used in all sample games, though it is not required if the game does not contain a free-spin entry from the base-game.",
    ),
    true,
  );
});

test("two numbers for one limit stay a disagreement", () => {
  assert.equal(
    sameClaim(
      "The retrigger caps the feature at 5 free spins.",
      "The retrigger caps the feature at 10 free spins.",
    ),
    false,
  );
});

test("a negation on one side stays a disagreement", () => {
  assert.equal(
    sameClaim(
      "The index.json must list every mode.",
      "The index.json must not list every mode.",
    ),
    false,
  );
});

test("required against optional stays a disagreement", () => {
  assert.equal(
    sameClaim(
      "A replay endpoint is required before submission.",
      "A replay endpoint is optional before submission.",
    ),
    false,
  );
});

test("each side carrying its own detail stays a disagreement", () => {
  assert.equal(
    sameClaim(
      "Books are uploaded compressed with zstd.",
      "Books are uploaded compressed with gzip.",
    ),
    false,
  );
});

test("an empty claim is never treated as an echo", () => {
  assert.equal(sameClaim("", "Books are uploaded compressed with zstd."), false);
});
