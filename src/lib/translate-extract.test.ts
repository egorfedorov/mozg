import "./test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { stringsIn } from "../../scripts/translate";

/**
 * The extraction that decides what gets translated at all.
 *
 * It shipped once without the trailing comma, and the effect was invisible in
 * the worst way: short strings translated, every long paragraph stayed
 * English, and the report said everything was done. Prettier wraps exactly the
 * calls whose text is long enough to be worth translating.
 */
test("finds t() calls however prettier has wrapped them", () => {
  assert.deepEqual(stringsIn(`<p>{t("one line")}</p>`), ["one line"]);
  assert.deepEqual(stringsIn(`{t(\n  "wrapped, with a trailing comma",\n)}`), [
    "wrapped, with a trailing comma",
  ]);
  assert.deepEqual(stringsIn(`{t(\n  "wrapped, no comma"\n)}`), ["wrapped, no comma"]);
  assert.deepEqual(stringsIn(`{t('single quotes')}`), ["single quotes"]);
  // An escaped newline is a layout break inside one sentence, kept as one.
  assert.deepEqual(stringsIn(String.raw`{t("first\nsecond")}`), ["first\nsecond"]);
  // A quote inside the sentence must not end it early.
  assert.deepEqual(stringsIn(String.raw`{t("say \"no\" clearly")}`), ['say "no" clearly']);
  // Not a t() call, and not translatable: a runtime value cannot be
  // translated ahead of time, so it must not be collected.
  assert.deepEqual(stringsIn("{t(name)}"), []);
  assert.deepEqual(stringsIn('{format("not me")}'), []);
  assert.deepEqual(stringsIn('{t("   ")}'), []);
});
