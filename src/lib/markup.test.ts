import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { markup } from "./markup";

// JSX would need a .tsx file, and the test runner's glob is *.test.ts. The
// call sites are JSX; this is the same tree written the long way.
const render = (sentence: string, slots: Parameters<typeof markup>[1]) =>
  renderToStaticMarkup(h("p", null, markup(sentence, slots)));

test("a slot wraps the translated text that came back inside it", () => {
  const html = render("Открой <0>каталог</0> и выбери инструмент.", [
    h("a", { href: "/explore" }),
  ]);
  assert.equal(html, '<p>Открой <a href="/explore">каталог</a> и выбери инструмент.</p>');
});

test("a translator may move a slot to the other end of the clause", () => {
  // The whole reason the sentence is not split into fragments: word order is
  // the translator's business, and both of these must render.
  const slots = [h("strong", null), h("em", null)];
  assert.equal(
    render("<0>Первое</0> потом <1>второе</1>.", slots),
    "<p><strong>Первое</strong> потом <em>второе</em>.</p>",
  );
  assert.equal(
    render("<1>Второе</1> сначала, <0>первое</0> потом.", slots),
    "<p><em>Второе</em> сначала, <strong>первое</strong> потом.</p>",
  );
});

test("a self-closing slot drops its value in as it is", () => {
  assert.equal(render("Куплено за <0/> один раз.", ["$99"]), "<p>Куплено за <span>$99</span> один раз.</p>");
  assert.equal(render("Строка<0/>разрыв", [h("br", null)]), "<p>Строка<br/>разрыв</p>");
});

test("a translation that lost a slot still renders its words", () => {
  // markup() never throws on a bad translation: the sentence is what the
  // reader needs, the markup is decoration. A dropped <0> costs the link, not
  // the paragraph — and scripts/translate.ts refuses such a translation at
  // write time, so this is the second line of defence, not the first.
  assert.equal(
    render("Каталог и инструмент.", [h("a", { href: "/explore" })]),
    "<p>Каталог и инструмент.</p>",
  );
});

test("English falls through unchanged when no translation exists", () => {
  // The key is the English, so the untranslated string carries the same slots.
  assert.equal(
    render("Open the <0>catalogue</0>.", [h("a", { href: "/explore" })]),
    '<p>Open the <a href="/explore">catalogue</a>.</p>',
  );
});
