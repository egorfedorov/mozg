import { test } from "node:test";
import assert from "node:assert/strict";
import { clipSnippet, createIpLimiter, groupHitsByBrain } from "./collective";

const BRAINS = [
  { slug: "alpha", handle: "ada", title: "Alpha docs" },
  { slug: "beta", handle: "bob", title: "Beta handbook" },
];

test("short text is returned whole, whitespace folded", () => {
  assert.equal(clipSnippet("a  b\n c"), "a b c");
});

test("long text is cut on a word boundary with an ellipsis", () => {
  const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
  const out = clipSnippet(words, 100);
  assert.ok(out.endsWith("…"));
  assert.ok(out.length <= 101);
  // ends after a complete word, not mid-word
  assert.ok(/word\d+$/.test(out.slice(0, -1)), out.slice(0, -1));
});

test("hits group under their brain with attribution, first-seen order wins", () => {
  const results = groupHitsByBrain(
    [
      { brain_slug: "beta", title: "Retries", excerpt: "beta answer", score: 0.9 },
      { brain_slug: "alpha", title: "Webhooks", excerpt: "alpha answer", score: 0.8 },
    ],
    BRAINS,
  );
  assert.deepEqual(
    results.map((r) => [r.handle, r.slug]),
    [
      ["bob", "beta"],
      ["ada", "alpha"],
    ],
  );
  assert.equal(results[0].answers[0].snippet, "beta answer");
});

test("two chunks of one note are one answer", () => {
  const results = groupHitsByBrain(
    [
      { brain_slug: "alpha", title: "Retries", excerpt: "chunk one", score: 0.9 },
      { brain_slug: "alpha", title: "Retries", excerpt: "chunk two", score: 0.8 },
      { brain_slug: "alpha", title: "Backoff", excerpt: "chunk three", score: 0.7 },
    ],
    BRAINS,
  );
  assert.deepEqual(
    results[0].answers.map((a) => a.title),
    ["Retries", "Backoff"],
  );
});

test("a brain offers at most perBrain answers and the board caps maxBrains", () => {
  const hits = Array.from({ length: 5 }, (_, i) => ({
    brain_slug: "alpha",
    title: `note ${i}`,
    excerpt: `answer ${i}`,
    score: 1 - i * 0.1,
  }));
  assert.equal(groupHitsByBrain(hits, BRAINS, 2)[0].answers.length, 2);

  const manyBrains = Array.from({ length: 8 }, (_, i) => ({
    slug: `b${i}`,
    handle: "h",
    title: `b${i}`,
  }));
  const spread = manyBrains.map((b, i) => ({
    brain_slug: b.slug,
    title: "n",
    excerpt: "e",
    score: 1 - i * 0.01,
  }));
  assert.equal(groupHitsByBrain(spread, manyBrains).length, 5);
});

test("hits from a brain outside the public set are dropped", () => {
  const results = groupHitsByBrain(
    [{ brain_slug: "private-brain", title: "Secret", excerpt: "leak?", score: 1 }],
    BRAINS,
  );
  assert.deepEqual(results, []);
});

test("the limiter lets max calls through and then refuses", () => {
  let t = 1000;
  const allow = createIpLimiter({ max: 2, windowMs: 100, now: () => t });
  assert.equal(allow("1.2.3.4"), true);
  assert.equal(allow("1.2.3.4"), true);
  assert.equal(allow("1.2.3.4"), false);
  // another IP has its own window
  assert.equal(allow("5.6.7.8"), true);
  // the window rolls
  t += 150;
  assert.equal(allow("1.2.3.4"), true);
});
