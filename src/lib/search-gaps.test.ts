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

test("one person retrying is not demand; two people are", () => {
  // The bug: thirteen questions about two unreleased games became permanent
  // checks on three PAID brains, because one studio retried its own project
  // queries and the harvest counted calls rather than people.
  const clusters = clusterQueries([
    { query: "red mesa showdown multiplier max", callerId: "studio" },
    { query: "red mesa showdown multiplier max", callerId: "studio" },
    { query: "red mesa showdown multiplier max", callerId: "studio" },
    { query: "how should a slot HUD keep safe areas in landscape", callerId: "a" },
    { query: "how should a slot HUD keep safe areas in landscape", callerId: "b" },
  ]);

  const own = clusters.find((c) => c.representative.startsWith("red mesa"))!;
  const shared = clusters.find((c) => c.representative.startsWith("how should"))!;

  assert.equal(own.count, 3);
  assert.equal(own.callers, 1);
  assert.equal(shared.count, 2);
  assert.equal(shared.callers, 2);

  // Ranked by people first, so the genuinely asked question wins even though
  // it was typed fewer times.
  assert.equal(clusters[0].representative, shared.representative);
});

test("a bare string still clusters, and counts as one caller", () => {
  const clusters = clusterQueries(["replay popup before play start", "replay popup before play start"]);
  assert.equal(clusters[0].count, 2);
  assert.equal(clusters[0].callers, 1);
});
