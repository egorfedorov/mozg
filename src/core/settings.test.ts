import { test } from "node:test";
import assert from "node:assert/strict";
import { languageFor, mergeSettings, systemLanguage } from "./settings";
import type { Settings } from "./types";
import { DEFAULT_SETTINGS } from "./store";

test("settings are replaced only by values a setting can hold", () => {
  const current: Settings = { nudge: "gentle", asks: true, language: "system", hidden: ["/a"] };
  assert.deepEqual(mergeSettings({ nudge: "firm" }, current), { nudge: "firm", asks: true, language: "system", hidden: ["/a"] }, "a field left out keeps its value");
  assert.deepEqual(mergeSettings({ hidden: ["/b", "/a", "/b"] }, current), { nudge: "gentle", asks: true, language: "system", hidden: ["/b", "/a"] }, "hidden is replaced, not added to, and has no doubles");
  assert.deepEqual(mergeSettings({ asks: false }, current), { nudge: "gentle", asks: false, language: "system", hidden: ["/a"] });
  assert.deepEqual(mergeSettings({ language: "ru" }, current), { nudge: "gentle", asks: true, language: "ru", hidden: ["/a"] });
  assert.equal(systemLanguage(), "en", "with nothing set in the environment, a machine speaks English");
  process.env.LANG = "ru_RU.UTF-8";
  assert.equal(languageFor("system"), "ru");
  assert.equal(languageFor("de"), "de", "the setting wins over the machine");
  delete process.env.LANG;
  assert.deepEqual(mergeSettings({}, DEFAULT_SETTINGS), DEFAULT_SETTINGS);
  for (const bad of [null, "firm", [], { nudge: "sometimes" }, { hidden: "nope" }, { hidden: [""] }, { hidden: [7] }, { nudge: 3 }, { asks: "no" }, { asks: 0 }, { language: "klingon" }, { language: "" }]) {
    assert.equal(mergeSettings(bad, current), null, JSON.stringify(bad));
  }
  assert.equal(mergeSettings({ hidden: Array.from({ length: 51 }, (_, i) => `/${i}`) }, current), null, "fifty projects is the limit");
});
