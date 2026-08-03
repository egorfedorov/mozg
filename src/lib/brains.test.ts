import { test } from "node:test";
import assert from "node:assert/strict";

// brains.ts imports @/db, which validates process env at import time; slugify
// never opens a connection, so a dummy DSN is enough.
process.env.DATABASE_URL ??= "postgres://localhost:5432/mozg-test";

const load = () => import("./brains");

test("cyrillic transliterates", async () => {
  const { slugify } = await load();
  assert.equal(slugify("Мой Мозг"), "moi-mozg");
  assert.equal(slugify("Ёлка"), "elka");
});

test("punctuation becomes dashes, edges are trimmed", async () => {
  const { slugify } = await load();
  assert.equal(slugify("Design System 2.0!"), "design-system-2-0");
  assert.equal(slugify("-- padded --"), "padded");
});

test("noise-only input falls back to a usable handle", async () => {
  const { slugify } = await load();
  assert.equal(slugify("!!!"), "brain");
  assert.equal(slugify(""), "brain");
});

test("capped at 39 characters", async () => {
  const { slugify } = await load();
  assert.ok(slugify("a".repeat(100)).length <= 39);
});

test("gapLabel: failing category with no notes says 'no source'", async () => {
  const { gapLabel } = await load();
  assert.equal(gapLabel("fail", 0, 0), "no source covers this");
});

test("gapLabel: no retrieval signal stays vague", async () => {
  const { gapLabel } = await load();
  // Runs from before migration 0014 have null retrieval_hits — the label
  // must not pretend to know why the check failed.
  assert.equal(gapLabel("fail", 3, null), "not enough material");
  assert.equal(gapLabel("partial", 3, null), "not enough material");
});

test("gapLabel: 0-1 hits means the material is missing", async () => {
  const { gapLabel } = await load();
  assert.equal(gapLabel("fail", 3, 0), "search finds nothing to answer from");
  assert.equal(gapLabel("partial", 3, 1), "search finds nothing to answer from");
});

test("gapLabel: hits with a fail points at wording, not coverage", async () => {
  const { gapLabel } = await load();
  const label = gapLabel("fail", 3, 4)!;
  assert.match(label, /wording, not coverage/);
  assert.match(label, /4 hits/);
});

test("gapLabel: passing and unexamined categories have no gap", async () => {
  const { gapLabel } = await load();
  assert.equal(gapLabel("pass", 3, 0), null);
  assert.equal(gapLabel("empty", 0, null), null);
});
