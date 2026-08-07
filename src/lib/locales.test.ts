import "./test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fromAcceptLanguage, isLocale, localeOf, LOCALES } from "./locales";

/**
 * The header parse. Worth a test because getting Chinese backwards is not a
 * near miss to a reader — Simplified and Traditional are not interchangeable,
 * and the region tag is the only thing that says which one was asked for.
 */
test("Accept-Language picks the right language, and the right Chinese", () => {
  assert.equal(fromAcceptLanguage("ru-RU,ru;q=0.9,en;q=0.8"), "ru");
  assert.equal(fromAcceptLanguage("en-GB,en;q=0.9"), "en");
  // Region-only tags fall back to the primary subtag.
  assert.equal(fromAcceptLanguage("pt-BR"), "pt");
  assert.equal(fromAcceptLanguage("es-419,es;q=0.9"), "es");

  assert.equal(fromAcceptLanguage("zh-CN"), "zh-Hans");
  assert.equal(fromAcceptLanguage("zh"), "zh-Hans");
  assert.equal(fromAcceptLanguage("zh-TW"), "zh-Hant");
  assert.equal(fromAcceptLanguage("zh-HK"), "zh-Hant");
  assert.equal(fromAcceptLanguage("zh-Hant"), "zh-Hant");

  // Quality values decide the order, not the order they were written in.
  assert.equal(fromAcceptLanguage("de;q=0.5,ja;q=0.9"), "ja");
  // Nothing we speak, and nothing at all, both read as English.
  assert.equal(fromAcceptLanguage("de-DE,de;q=0.9"), "en");
  assert.equal(fromAcceptLanguage(null), "en");
});

test("an unknown code is not a locale, and resolves to English", () => {
  assert.equal(isLocale("ru"), true);
  assert.equal(isLocale("kl"), false);
  assert.equal(isLocale(undefined), false);
  assert.equal(localeOf("kl").code, "en");
  // Both right-to-left languages are marked; a missed dir is an unreadable page.
  assert.deepEqual(
    LOCALES.filter((l) => l.rtl).map((l) => l.code),
    ["ar", "ur"],
  );
});
