import "./test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { affordance } from "./genprice";

/**
 * A number of cents is not an answer to "can I do this". The user asking an
 * agent for art wants to hear what their balance buys BEFORE anything is
 * planned — the alternative is the failure this came from: three and a half
 * minutes of planning, then a refusal on balance.
 */

test("a balance is reported as assets, not as cents", () => {
  const flat = { symbol: 100, background: 100 };
  assert.match(affordance(1000, flat), /Balance \$10\.00/);
  assert.match(affordance(1000, flat), /about 10 assets at \$1\.00 each/);
  // Singular reads as a sentence, not as "1 assets".
  assert.match(affordance(100, flat), /about 1 asset at/);
});

test("mixed prices are given as a range, because the set is not chosen yet", () => {
  const mixed = { symbol: 100, background: 500 };
  const text = affordance(1000, mixed);
  // Ten cheap ones or two expensive ones — promising "10" would be a promise
  // about a set nobody has picked.
  assert.match(text, /between 2 and 10 assets/);
  assert.match(text, /\$1\.00–\$5\.00 each/);
});

test("too little to buy anything says so, and names both ways out", () => {
  const text = affordance(50, { symbol: 100 });
  assert.match(text, /not enough for a single asset/);
  assert.match(text, /the cheapest is \$1\.00/);
  // The two ways out, because "top up" alone is a dead end for anyone who
  // would rather spend their own key than our balance.
  assert.match(text, /mozg\.sh\/settings/);
  assert.match(text, /apimart\.ai\/keys/);
});

test("an empty price table still answers", () => {
  // A missing setting must never be the reason a studio hears nothing.
  assert.match(affordance(1000, {}), /Balance \$10\.00/);
});
