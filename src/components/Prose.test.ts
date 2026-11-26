import { test } from "node:test";
import assert from "node:assert/strict";
import { hasCode, notWords } from "./Prose";

test("an address is one whole, with its port, and a version is three numbers", () => {
  assert.deepEqual(
    notWords(
      "Say desk, or open the address the agent gives you: http://127.0.0.1:4317 by default. The desk is served by the plugin, on 127.0.0.1 only, and refreshes itself while its tab is in front.",
    ),
    ["http://127.0.0.1:4317", "127.0.0.1"],
  );
  assert.deepEqual(notWords("It opens at http://127.0.0.1:4317. Node 20.1.3 is needed."), ["http://127.0.0.1:4317", "20.1.3"]);
  assert.deepEqual(
    notWords("See https://mozg.sh/docs. And https://mozg.sh/, and https://github.com/egorfedorov/mozg."),
    ["https://mozg.sh/docs", "https://mozg.sh/", "https://github.com/egorfedorov/mozg"],
  );
});

test("paths, options and home folders are found, without what closes the sentence", () => {
  assert.deepEqual(
    notWords("Files in ~/.mozg. Logs in ~/.claude/projects. Start with --dangerously-skip-permissions or --permission-mode dontAsk; the file is src/payments/charge.ts."),
    ["~/.mozg", "~/.claude/projects", "--dangerously-skip-permissions", "--permission-mode", "src/payments/charge.ts"],
  );
  // The closing quote of any language stays outside.
  assert.deepEqual(notWords("In «https://mozg.sh/docs» and “https://mozg.sh” the quote stays outside."), ["https://mozg.sh/docs", "https://mozg.sh"]);
  assert.deepEqual(notWords("nothing here but words, 1, 3, 7 and 30 days"), []);
});

test("hasCode asks the same of every sentence, whatever it was asked before", () => {
  assert.equal(hasCode("at http://127.0.0.1:4317 by default"), true);
  assert.equal(hasCode("nothing here but words"), false);
  assert.equal(hasCode("at http://127.0.0.1:4317 by default"), true);
});
