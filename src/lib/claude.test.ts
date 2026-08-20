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

test("a reseller's stop_reason is a failure, a model's is not", async () => {
  const { endedCleanly } = await load();
  // The whole point: "error" is what a proxy says when it gave up mid-answer.
  assert.equal(endedCleanly("error"), false);
  assert.equal(endedCleanly("upstream_timeout"), false);
  for (const reason of ["end_turn", "tool_use", "max_tokens", "refusal"]) {
    assert.equal(endedCleanly(reason), true, reason);
  }
  // In flight, so nothing has gone wrong yet.
  assert.equal(endedCleanly(null), true);
});

test("an array argument the model quoted comes back as an array", async () => {
  const { unstringify } = await load();
  const schema = {
    type: "object",
    properties: { verdicts: { type: "array" }, note: { type: "string" } },
  };

  // The shape that killed an exam run: the whole array arrived as a string.
  assert.deepEqual(
    unstringify({ verdicts: '[{"id":"a","passed":true}]', note: "fine" }, schema),
    { verdicts: [{ id: "a", passed: true }], note: "fine" },
  );

  // A field the schema calls a string stays a string even when it parses,
  // and an array field that is not JSON is left for the schema to report.
  assert.deepEqual(unstringify({ note: "[1,2]", verdicts: "not json" }, schema), {
    note: "[1,2]",
    verdicts: "not json",
  });
});

// ─── retrying a torn stream ─────────────────────────────────────────────────
//
// The two shapes below are transcribed from what production actually threw
// (app_errors, 08-16 to 08-20). Both arrive after a 200, which is why the
// SDK's own maxRetries never sees them.

test("a stream the endpoint tore is worth retrying", async () => {
  const { endpointTore, EndpointTore } = await load();

  // MessageStream.js: the stream closed carrying no assistant message.
  assert.ok(
    endpointTore(new Error("stream ended without producing a Message with role=assistant")),
  );
  // undici: socket cut mid-body. Arrives raw, not wrapped by the SDK — which
  // is why matching on APIConnectionError alone would have missed the one
  // shape that happens most.
  assert.ok(endpointTore(new TypeError("terminated")));
  // Assigned rather than passed to the constructor: tsx transpiles this file
  // to CJS and the options argument does not survive it, so the constructor
  // form silently tests nothing. The wrapper is what undici actually throws.
  const wrapped = new Error("fetch failed");
  wrapped.cause = new TypeError("terminated");
  assert.ok(endpointTore(wrapped));
  // What the SDK says when it wraps a connection failure itself. Matched by
  // message, not by class: the SDK's dual CJS/ESM builds make `instanceof`
  // depend on which copy the checking module resolved, and it came out false
  // from inside claude.ts for an error built one import away.
  assert.ok(endpointTore(new Error("Connection error.")));
  // Our own name for a stop_reason no model produces.
  assert.ok(endpointTore(new EndpointTore("endpoint ended the response early")));
});

test("nothing a retry cannot fix is retried", async () => {
  const { endpointTore } = await load();
  const { OutputCutoff } = await import("./cutoff");

  for (const err of [
    // The answer was too long, not interrupted — the caller halves it instead.
    new OutputCutoff("ran out of output room after 16000 tokens"),
    // The proxy dropped tool_choice: the fix is a different endpoint.
    new Error("model did not call save_notes (stop_reason=end_turn)"),
    new Error("request refused by safety classifier"),
    // Money, not weather. Retrying spends nothing and fixes nothing.
    new Error('402 {"error":{"message":"insufficient balance"}}'),
    new Error("400 invalid_request_error"),
    // A word that merely contains the token must not trip the match.
    new Error("the contract was terminated by the vendor"),
    "not an error at all",
    null,
  ]) {
    assert.equal(endpointTore(err), false, `wrongly retried: ${String(err)}`);
  }
});
