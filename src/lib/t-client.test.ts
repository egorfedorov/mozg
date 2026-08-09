import "./test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize } from "./msg";
import { key } from "./t";

/**
 * The two halves of the site have to agree about what a sentence IS.
 *
 * The server looks a translation up by sha1 of the English; the browser has no
 * sha1 and looks it up by the English itself. Both run the string through
 * normalize() first, and that is the entire contract between them — get it
 * wrong and a paragraph translates in the server-rendered page and prints
 * English in the cookie bar underneath it, for no visible reason.
 */
test("normalize collapses however the source laid the sentence out", () => {
  // The same sentence written across three lines in JSX and on one in a data
  // array. Prettier decides which, and it must not decide translations.
  assert.equal(normalize("Accept  all"), "Accept all");
  assert.equal(normalize("\n  Reject\n  optional\n"), "Reject optional");
  assert.equal(normalize(" Customize "), "Customize");
  // Idempotent: the client dictionary is written from already-normalized keys
  // and normalized again on lookup.
  assert.equal(normalize(normalize("  a   b  ")), normalize("  a   b  "));
});

test("the server key and the client lookup agree on the same sentence", () => {
  const wrapped = "Essential cookies keep you signed in\n  and remember this choice.";
  const flat = "Essential cookies keep you signed in and remember this choice.";

  // Server side: one key for both layouts.
  assert.equal(key(wrapped), key(flat));

  // Client side: one dictionary entry for both layouts. Written by
  // scripts/translate.ts under normalize(english), read back through the same.
  const dict: Record<string, string> = { [normalize(flat)]: "перевод" };
  const t = (english: string) => dict[normalize(english)] ?? english;
  assert.equal(t(wrapped), "перевод");
  assert.equal(t(flat), "перевод");

  // A sentence with no translation prints its English, never a key.
  assert.equal(t("Customize"), "Customize");
});
