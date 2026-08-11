import { test } from "node:test";
import assert from "node:assert/strict";
import { offerFor } from "./route-cost";

/**
 * The bug these exist against: a route reading most of the igaming pack quoted
 * ~$200 — the sum of the brains' own prices — while /packs/igaming sold the
 * same material for $99. Slugs below are real ones from lib/packs.ts, so a
 * pack whose membership changes fails here rather than on the page.
 */

test("a pack replaces the brains it covers when the parts cost more", () => {
  const offer = offerFor([
    { slug: "slot-studio-compliance", parentSlug: null, priceCents: 1900 },
    { slug: "pixijs-casino", parentSlug: null, priceCents: 1900 },
    { slug: "spine-2d-animation", parentSlug: null, priceCents: 1900 },
    { slug: "slot-art-direction", parentSlug: null, priceCents: 1900 },
    { slug: "slot-animation-craft", parentSlug: null, priceCents: 1900 },
    // A family member, reached through its parent rather than by its own slug.
    { slug: "stake-engine-rgs", parentSlug: "stake-engine", priceCents: 1900 },
  ]);
  assert.equal(offer.packs.length, 1);
  assert.equal(offer.packs[0].slug, "igaming");
  assert.equal(offer.totalCents, 9900);
  assert.deepEqual(offer.brains, []);
});

test("two brains are cheaper bought apart than a whole pack", () => {
  const offer = offerFor([
    { slug: "slot-studio-compliance", parentSlug: null, priceCents: 1900 },
    { slug: "pixijs-casino", parentSlug: null, priceCents: 1900 },
  ]);
  assert.deepEqual(offer.packs, []);
  assert.equal(offer.brains.length, 2);
  assert.equal(offer.totalCents, 3800);
});

test("a paid brain in no pack keeps its own price beside a pack", () => {
  const offer = offerFor([
    { slug: "slot-studio-compliance", parentSlug: null, priceCents: 1900 },
    { slug: "pixijs-casino", parentSlug: null, priceCents: 1900 },
    { slug: "spine-2d-animation", parentSlug: null, priceCents: 1900 },
    { slug: "slot-art-direction", parentSlug: null, priceCents: 1900 },
    { slug: "slot-animation-craft", parentSlug: null, priceCents: 1900 },
    { slug: "stake-engine-rgs", parentSlug: "stake-engine", priceCents: 1900 },
    { slug: "some-outsider", parentSlug: null, priceCents: 2900 },
  ]);
  assert.deepEqual(
    offer.packs.map((p) => p.slug),
    ["igaming"],
  );
  assert.deepEqual(
    offer.brains.map((b) => b.slug),
    ["some-outsider"],
  );
  assert.equal(offer.totalCents, 12800);
});

test("free brains cost nothing and never drag in a pack", () => {
  const offer = offerFor([
    { slug: "slot-studio-compliance", parentSlug: null, priceCents: 0 },
    { slug: "pixijs-casino", parentSlug: null, priceCents: 0 },
  ]);
  assert.deepEqual(offer.packs, []);
  assert.deepEqual(offer.brains, []);
  assert.equal(offer.totalCents, 0);
});
