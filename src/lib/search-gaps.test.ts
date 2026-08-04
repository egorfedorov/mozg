import { test } from "node:test";
import assert from "node:assert/strict";
import { clusterQueries, normalizeQuery, MIN_QUERY_LENGTH } from "./search-gaps";

test("normalisation folds case, punctuation and spacing into one key", () => {
  assert.equal(normalizeQuery("How do I reset a webhook?"), "how do i reset a webhook");
  assert.equal(normalizeQuery("  how   do  i  reset  a  webhook  "), "how do i reset a webhook");
  assert.equal(normalizeQuery("how do i reset a webhook…"), "how do i reset a webhook");
});

test("Cyrillic survives normalisation", () => {
  assert.equal(normalizeQuery("Как сбросить вебхук?"), "как сбросить вебхук");
});

test("retried phrasings cluster together and count the demand", () => {
  const clusters = clusterQueries([
    "How do I reset a webhook?",
    "how do i reset a webhook",
    "what is the refund policy?",
    "HOW DO I RESET A WEBHOOK?!",
  ]);
  assert.equal(clusters.length, 2);
  assert.equal(clusters[0].count, 3);
  assert.equal(clusters[1].count, 1);
});

test("the representative is the freshest phrasing (input is newest-first)", () => {
  const clusters = clusterQueries([
    "How do I reset a webhook?",
    "how do i reset a webhook",
  ]);
  assert.equal(clusters[0].representative, "How do I reset a webhook?");
});

test("clusters sort by demand, most-asked first", () => {
  const clusters = clusterQueries([
    "what is the refund policy?",
    "how do i reset a webhook",
    "what is the refund policy",
    "how do i reset a webhook?",
    "how do i reset a webhook",
  ]);
  assert.equal(clusters[0].representative, "how do i reset a webhook");
  assert.equal(clusters[0].count, 3);
});

test("noise queries shorter than the minimum are dropped", () => {
  const short = "a".repeat(MIN_QUERY_LENGTH - 1);
  const justLongEnough = "a".repeat(MIN_QUERY_LENGTH);
  const clusters = clusterQueries([short, "???", "", justLongEnough]);
  assert.deepEqual(
    clusters.map((c) => c.representative),
    [justLongEnough],
  );
});

test("punctuation-only differences still split real gaps", () => {
  // Deliberate: "webhook retries" and "webhook idempotency" are different
  // gaps and must NOT cluster, however similar they look.
  const clusters = clusterQueries([
    "how do webhook retries work?",
    "how does webhook idempotency work?",
  ]);
  assert.equal(clusters.length, 2);
});
