import { test } from "node:test";
import assert from "node:assert/strict";
import { finished, indexFile } from "../../scripts/i18n-index";

test("a language is finished on a surface only when its column is complete", () => {
  const coverage = { de: { messages: 1, docs: 0.5 }, ru: { messages: 1, docs: 1 }, es: { messages: 0.99, docs: 1 } };
  assert.deepEqual(finished(coverage, "messages"), ["de", "ru"]);
  assert.deepEqual(finished(coverage, "docs"), ["es", "ru"]);
});

test("an index file lists the finished languages, and registers each of them", () => {
  const text = indexFile("messages", ["de", "zh-tw"]);
  assert.match(text, /import de from "\.\/de";/);
  assert.match(text, /import zh_tw from "\.\/zh-tw";/);
  assert.match(text, /"zh-tw": zh_tw,/);
  assert.match(text, /registerDictionary\(lang as Lang, dictionary\)/);
  assert.doesNotMatch(text, /import ru from/);
});

test("only the messages index names the languages the plugin may offer", () => {
  assert.match(indexFile("messages", []), /MESSAGE_LANGS/);
  assert.doesNotMatch(indexFile("docs", []), /MESSAGE_LANGS/);
});
