import { test } from "node:test";
import assert from "node:assert/strict";
import { count, fill, languageOf, pluralCategory, registerDictionary, sentences, setLanguage, t, type Dictionary } from "./i18n";

test("a language is narrowed from what a system asks for", () => {
  assert.equal(languageOf("ru-RU"), "ru");
  assert.equal(languageOf("zh-CN"), "zh");
  assert.equal(languageOf("zh-Hant-TW"), "zh-tw");
  assert.equal(languageOf("zh-TW"), "zh-tw");
  assert.equal(languageOf("pt-BR"), "pt");
  assert.equal(languageOf("de"), "de");
  assert.equal(languageOf("pl-PL"), "en", "a language we do not speak is English");
  assert.equal(languageOf(""), "en");
  assert.equal(languageOf(undefined), "en");
});

test("each language counts the way it counts", () => {
  assert.deepEqual([1, 2, 0].map((n) => pluralCategory("en", n)), ["one", "other", "other"]);
  assert.deepEqual([0, 1, 2].map((n) => pluralCategory("fr", n)), ["one", "one", "other"]);
  assert.deepEqual([1, 2, 5, 11, 21, 112, 0].map((n) => pluralCategory("ru", n)), ["one", "few", "many", "many", "one", "many", "many"]);
  assert.deepEqual([1, 2].map((n) => pluralCategory("ja", n)), ["other", "other"]);
  assert.deepEqual([1, 2].map((n) => pluralCategory("tr", n)), ["one", "other"]);
});

test("a missing translation is the English, and a plural may have more forms than English", () => {
  setLanguage("en");
  assert.equal(count(1, "<0/> change", "<0/> changes"), "1 change");
  assert.equal(count(5, "<0/> change", "<0/> changes"), "5 changes");

  registerDictionary("ru", {
    "<0/> change": "<0/> изменение",
    "<0/> changes": { few: "<0/> изменения", many: "<0/> изменений", other: "<0/> изменения" },
    "mozg asks before this change.": "mozg спрашивает перед этой правкой.",
  } satisfies Dictionary);
  setLanguage("ru");
  assert.equal(t("mozg asks before this change."), "mozg спрашивает перед этой правкой.");
  assert.equal(t("Never translated."), "Never translated.", "falls back to the English");
  assert.equal(t("  mozg asks   before this change.\n"), "mozg спрашивает перед этой правкой.", "keyed by the normalised sentence");
  assert.equal(count(1, "<0/> change", "<0/> changes"), "1 изменение");
  assert.equal(count(3, "<0/> change", "<0/> changes"), "3 изменения");
  assert.equal(count(11, "<0/> change", "<0/> changes"), "11 изменений");
  assert.equal(count(2, "Nothing at all", "Nothing translated"), "Nothing translated", "an untranslated count is the English");

  // A language with one form for everything may translate the "many" sentence once.
  registerDictionary("ja", { "<0/> changes": "<0/> 回の変更" } satisfies Dictionary);
  setLanguage("ja");
  assert.equal(count(1, "<0/> change", "<0/> changes"), "1 回の変更");
  assert.equal(count(7, "<0/> change", "<0/> changes"), "7 回の変更");
  setLanguage("xx" as never);
  assert.equal(count(2, "<0/> change", "<0/> changes"), "2 changes", "a language that does not exist is English");
  setLanguage("en");
});

test("slots are filled in order, and a missing slot is empty rather than a marker", () => {
  assert.equal(fill("Ownership today: <0/>%", [48]), "Ownership today: 48%");
  assert.equal(fill("<0/> of <1/>", ["a"]), "a of ");
});

test("a count fills its own slot and leaves the others to the caller", () => {
  const one = "<1/> of the <0/> module it touched is yours.";
  const many = "<1/> of the <0/> modules it touched are yours.";
  assert.equal(fill(count(5, many, many), [5, 3]), "3 of the 5 modules it touched are yours.");
  assert.equal(fill(count(1, one, many), [1, 1]), "1 of the 1 module it touched is yours.");
  // In a language with forms of its own, the same: both numbers, and no marker left.
  setLanguage("ru");
  for (const n of [1, 2, 5, 11, 21]) {
    const said = fill(count(n, one, many), [n, 3]);
    assert.equal(said.startsWith("3 "), true, said);
    assert.equal(said.startsWith("3 "), true, said);
    assert.equal(said.includes(String(n)), true, said);
    assert.equal(/<\/?>\d/.test(said), false, said);
  }
  setLanguage("en");
});

test("sentences sit side by side as the language writes them", () => {
  assert.equal(sentences("One.", "Two."), "One. Two.");
  assert.equal(sentences("Alone."), "Alone.");
  // A full stop that carries its own room: no space after it, or the line shows a gap.
  assert.equal(sentences("変更が入りました。", "説明返しをどうぞ。"), "変更が入りました。説明返しをどうぞ。");
});
