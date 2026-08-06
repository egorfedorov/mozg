import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_ON, ESSENTIAL_ONLY, parseConsent, serializeConsent } from "./consent";

/**
 * The one rule worth a test: nothing but an explicit, well-formed yes may read
 * as consent. Every other outcome has to fall back to "ask again", because the
 * failure mode on this path is loading a tracker for someone who declined.
 */

test("a round trip preserves the choice", () => {
  assert.deepEqual(parseConsent(serializeConsent(ALL_ON)), ALL_ON);
  assert.deepEqual(parseConsent(serializeConsent(ESSENTIAL_ONLY)), ESSENTIAL_ONLY);
});

test("nothing unparseable ever reads as consent", () => {
  for (const bad of [null, undefined, "", "not json", "%7Bbroken", "[]", "null", '"yes"']) {
    const got = parseConsent(bad);
    assert.ok(got === null || got.analytics === false, `"${bad}" must not grant analytics`);
  }
});

test("only a literal true grants a group", () => {
  // A truthy string is what a hand-edited or half-migrated cookie looks like.
  const sneaky = encodeURIComponent(JSON.stringify({ analytics: "true", functional: 1 }));
  assert.deepEqual(parseConsent(sneaky), ESSENTIAL_ONLY);
});

test("essential is never a choice", () => {
  const off = encodeURIComponent(JSON.stringify({ essential: false, analytics: true }));
  assert.equal(parseConsent(off)?.essential, true);
});
