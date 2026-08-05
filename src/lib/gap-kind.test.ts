import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyFailure, covers } from "./gap-kind";

test("covers: half the significant terms is enough, short words do not count", () => {
  assert.ok(covers("The trailingSlash option redirects URLs without a slash", "trailingSlash redirects URLs"));
  assert.ok(!covers("ESLint rules and CLI options for the build command", "trailingSlash redirects URLs"));
  // Nothing but short words: no signal to work with, so no claim of coverage.
  assert.ok(!covers("a b c the and of", "a b c"));
});

test("classifyFailure: the four causes a score cannot tell apart", () => {
  const expect = "rewrites proxy the request without changing the visible URL";

  // A negative probe answered confidently is never a content gap — adding
  // material would teach the brain to bluff harder.
  assert.equal(
    classifyFailure({ negative: true, expect, shown: "anything at all" }),
    "bluff",
  );

  // Retrieval returned nothing.
  assert.equal(classifyFailure({ negative: false, expect, shown: "   " }), "missing");

  // The judge was shown the answer and still failed the check: the note is thin.
  assert.equal(
    classifyFailure({
      negative: false,
      expect,
      shown: "rewrites act as a proxy for the request and mask the visible URL",
    }),
    "thin",
  );

  // Not in the five the judge saw, but present deeper down: a ranking problem.
  assert.equal(
    classifyFailure({
      negative: false,
      expect,
      shown: "ESLint rules and CLI options",
      wide: ["something else", "rewrites proxy the request and keep the visible URL"],
    }),
    "retrieval",
  );

  // Not shown, not deeper either.
  assert.equal(
    classifyFailure({
      negative: false,
      expect,
      shown: "ESLint rules and CLI options",
      wide: ["build output settings", "turbopack flags"],
    }),
    "missing",
  );
});
