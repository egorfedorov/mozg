import { test } from "node:test";
import assert from "node:assert/strict";

// claude.ts validates process env at import time; costCents never opens a
// connection, so a dummy DSN is all it takes to load the module.
process.env.DATABASE_URL ??= "postgres://localhost:5432/mozg-test";

const load = () => import("./claude");

test("dated and -thinking suffixes price as the base model", async () => {
  const { costCents } = await load();
  const usage = { input_tokens: 1_000_000, output_tokens: 0 };
  const base = costCents("claude-haiku-4-5", usage);
  assert.ok(base > 0);
  assert.equal(costCents("claude-haiku-4-5-20251001", usage), base);
  assert.equal(costCents("claude-haiku-4-5-thinking", usage), base);
});

test("cache reads bill at 0.1x input, cache writes at 1.25x", async () => {
  const { costCents } = await load();
  // haiku: $1/M in, $5/M out.
  assert.equal(
    costCents("claude-haiku-4-5", { input_tokens: 1_000_000, output_tokens: 0 }),
    100,
  );
  assert.equal(
    costCents("claude-haiku-4-5", {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 1_000_000,
    }),
    10,
  );
  assert.equal(
    costCents("claude-haiku-4-5", {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
    }),
    125,
  );
  assert.equal(
    costCents("claude-haiku-4-5", { input_tokens: 0, output_tokens: 1_000_000 }),
    500,
  );
});

test("unknown model reports zero rather than inventing a price", async () => {
  const { costCents } = await load();
  assert.equal(
    costCents("some-proxy-model-9", { input_tokens: 1_000_000, output_tokens: 1_000_000 }),
    0,
  );
});
