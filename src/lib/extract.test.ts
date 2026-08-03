import { test } from "node:test";
import assert from "node:assert/strict";

// extract.ts pulls in claude.ts, which validates process env at import time;
// segments never opens a connection, so a dummy DSN is enough.
process.env.DATABASE_URL ??= "postgres://localhost:5432/mozg-test";

const load = () => import("./extract");

test("short text stays one segment", async () => {
  const { segments } = await load();
  const text = "The balance sits 24px from the left edge.";
  assert.deepEqual(segments(text), [text]);
});

test("splits prefer a blank-line boundary over a mid-sentence cut", async () => {
  const { segments } = await load();
  const text = "a".repeat(55_000) + "\n\n" + "b".repeat(55_000);
  const parts = segments(text);
  assert.equal(parts.length, 2);
  assert.equal(parts[0].length, 55_000);
  assert.equal(parts.join(""), text, "split must not lose or reorder a byte");
});

test("long text without paragraph breaks still splits, losslessly", async () => {
  const { segments } = await load();
  const text = "x".repeat(150_000);
  const parts = segments(text);
  assert.equal(parts.length, 3);
  assert.ok(parts.every((p) => p.length <= 60_000));
  assert.equal(parts.join(""), text);
});

test("exactly at the cap is accepted", async () => {
  const { segments } = await load();
  const parts = segments("x".repeat(720_000));
  assert.equal(parts.length, 12);
});

test("past the cap fails loudly instead of dropping the tail", async () => {
  const { segments } = await load();
  assert.throws(() => segments("x".repeat(800_000)), /Split it into smaller sources/);
});
