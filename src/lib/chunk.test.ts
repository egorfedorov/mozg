import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkText, chunksForNote, estimateTokens } from "./chunk";

test("short text stays one chunk", () => {
  assert.deepEqual(chunkText("The balance sits 24px from the left edge."), [
    "The balance sits 24px from the left edge.",
  ]);
});

test("empty input yields nothing", () => {
  assert.deepEqual(chunkText("   \n\n  "), []);
});

test("long text splits without losing or ballooning content", () => {
  // Distinct paragraphs so we can assert none is dropped.
  const paras = Array.from(
    { length: 14 },
    (_, i) =>
      `Правило ${i}: элемент номер ${i} смещён на ${i * 4} пикселей от левого края HUD. ` +
      "Это значение фиксировано и не зависит от разрешения экрана.",
  );
  const text = paras.join("\n\n");

  const chunks = chunkText(text);
  assert.ok(chunks.length > 1, "expected a split");
  assert.ok(chunks.every((c) => c.trim().length > 0));

  // Nothing dropped.
  const joined = chunks.join("\n\n");
  for (const p of paras) {
    assert.ok(joined.includes(`Правило ${p.split(":")[0].split(" ")[1]}:`));
  }

  // No runaway chunk.
  for (const c of chunks) {
    assert.ok(estimateTokens(c) < 400 * 2, `chunk too big: ${estimateTokens(c)}`);
  }

  // Overlap adds some, but must not double the corpus.
  const total = chunks.reduce((n, c) => n + c.length, 0);
  assert.ok(total < text.length * 1.7, "overlap should not balloon the text");
});

test("chunks overlap so a boundary fact stays findable", () => {
  const sentences = Array.from(
    { length: 60 },
    (_, i) => `Rule number ${i} states that element ${i} is offset by ${i * 4} pixels.`,
  ).join(" ");

  const chunks = chunkText(sentences);
  assert.ok(chunks.length > 1);
  const tailOfFirst = chunks[0].slice(-120);
  const headOfSecond = chunks[1].slice(0, 200);
  const shared = tailOfFirst
    .split(/\s+/)
    .some((w) => w.length > 4 && headOfSecond.includes(w));
  assert.ok(shared, "expected shared text across the boundary");
});

test("note chunks are prefixed with the title", () => {
  const chunks = chunksForNote("HUD balance position", "Sits 24px from the left.");
  assert.equal(chunks.length, 1);
  assert.ok(chunks[0].startsWith("HUD balance position\n\n"));
});

test("token estimate is in the right ballpark", () => {
  assert.ok(estimateTokens("hello world") < 10);
  assert.ok(estimateTokens("x".repeat(3300)) > 900);
});
