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

/**
 * The shape that reached production: 627 KB of paragraphs a little over half a
 * segment long. Every test above used text with no blank lines at all, so the
 * paragraph-snapping branch — the one that decides how full a segment ends up —
 * was never measured, and it was packing them half empty. The source failed
 * against "627 KB is over the 720 KB one source can hold", which is not a
 * sentence anybody can act on.
 */
test("paragraphs just over half a segment still pack full segments", async () => {
  const { segments } = await load();
  const text = (`${"x".repeat(30_100)}\n\n`).repeat(21).slice(0, 627_000);

  const parts = segments(text);
  assert.equal(parts.join(""), text, "lossless");
  assert.ok(parts.length <= 12, `needed ${parts.length} segments`);
  // The floor is what makes the advertised limit true: no segment may come
  // back under 90% except the remainder at the end.
  for (const p of parts.slice(0, -1)) {
    assert.ok(p.length >= 54_000, `segment of ${p.length} is under the floor`);
  }
});

test("the size a source cannot exceed is one it could actually reach", async () => {
  const { segments } = await load();
  // Whatever the paragraph layout, 648 KB has to fit — that is the number the
  // error message quotes, and quoting an unreachable one is the original bug.
  const paras = (`${"y".repeat(9_000)}\n\n`).repeat(80).slice(0, 648_000);
  assert.equal(segments(paras).join(""), paras);
});

test("a model's bad label costs the field, not the page", async () => {
  const { responseSchema } = await import("./extract");
  const parsed = responseSchema.parse({
    notes: [
      {
        title: "x".repeat(300),
        body: "The play endpoint returns 400 with code ERR_IS.",
        kind: "api-detail", // invented enum value — the observed haiku slip
        category: "y".repeat(120),
        confidence: 1.4,
      },
    ],
  });
  assert.equal(parsed.notes[0].kind, "fact");
  assert.equal(parsed.notes[0].title.length, 200);
  assert.equal(parsed.notes[0].category.length, 80);
  assert.equal(parsed.notes[0].confidence, 1);
});

test("halving a cut-off segment keeps every byte, on a paragraph break", async () => {
  const { halve } = await load();
  const text = "a".repeat(20_000) + "\n\n" + "b".repeat(20_000);
  const [first, second] = halve(text);
  assert.equal(first.length, 20_000, "cuts at the blank line, not mid-word");
  assert.equal(first + second, text, "a split retry must not drop material");

  // No blank line anywhere: still splits, still lossless.
  const flat = "x".repeat(9_000);
  const [a, b] = halve(flat);
  assert.ok(a.length > 0 && b.length > 0);
  assert.equal(a + b, flat);
});
