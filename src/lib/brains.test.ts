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
