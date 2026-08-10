import { test } from "node:test";
import assert from "node:assert/strict";
import { fromExtension } from "@/lib/client-error";

test("an extension frame on top is not our error", () => {
  assert.equal(
    fromExtension(
      "Error: cleanup\n" +
        "    at k (chrome-extension://fjoaledfpmneenckfbpdfhkmimnjocfa/csSpoofGeoMain.bundle.js:1:10065)\n" +
        "    at L (https://mozg.sh/_next/static/chunks/3nm2o7oo_ft81.js:1:218674)",
    ),
    true,
  );
  // Firefox writes no message header.
  assert.equal(fromExtension("k@moz-extension://abc/content.js:1:1"), true);
});

test("our frame on top stays ours, even with an extension below", () => {
  assert.equal(
    fromExtension(
      "TypeError: x is not a function\n" +
        "    at L (https://mozg.sh/_next/static/chunks/3nm2o7oo_ft81.js:1:218674)\n" +
        "    at k (chrome-extension://abc/bundle.js:1:1)",
    ),
    false,
  );
});

test("no stack is not a reason to drop a report", () => {
  assert.equal(fromExtension(undefined), false);
  assert.equal(fromExtension("Error: cleanup"), false);
});
