import "./test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { validSignature, mergedRepo, rootMatchesRepo } from "./github";

/**
 * The push callback is reachable by anyone who can guess the URL, so what
 * matters is what it refuses. Requeueing a crawl is cheap and idempotent;
 * letting a stranger drive it on demand is not.
 */

const SECRET = "test-secret";
const body = JSON.stringify({ ref: "refs/heads/main" });
const good = `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;

test("only a signature made with the secret over these exact bytes passes", () => {
  assert.equal(validSignature(body, good, SECRET), true);

  assert.equal(validSignature(body, null, SECRET), false, "unsigned");
  assert.equal(validSignature(body, "", SECRET), false, "empty");
  assert.equal(validSignature(body, good, "other-secret"), false, "wrong secret");
  // Right shape, right length, wrong value — so the length guard is not what
  // rejects it and the comparison itself is doing the work.
  assert.equal(validSignature(body, `sha256=${"a".repeat(64)}`, SECRET), false);
  // A different body with a valid-for-something signature.
  assert.equal(validSignature(`${body} `, good, SECRET), false, "body tampered");
});

test("a length mismatch answers false instead of throwing", () => {
  // timingSafeEqual throws when the buffers differ in length; an exception
  // here would be a 500 on a request an attacker controls.
  assert.doesNotThrow(() => validSignature(body, "sha256=short", SECRET));
  assert.equal(validSignature(body, "sha256=short", SECRET), false);
});

test("only a merge to the default branch counts", () => {
  const repo = { full_name: "o/r", default_branch: "main" };
  assert.equal(mergedRepo({ ref: "refs/heads/main", repository: repo }), "o/r");
  assert.equal(mergedRepo({ ref: "refs/heads/feature/x", repository: repo }), null);
  // A repo whose default branch is not called main.
  assert.equal(
    mergedRepo({ ref: "refs/heads/trunk", repository: { full_name: "o/r", default_branch: "trunk" } }),
    "o/r",
  );
  assert.equal(mergedRepo({ ref: "refs/tags/v1", repository: repo }), null);
  assert.equal(mergedRepo({ repository: repo }), null);
  assert.equal(mergedRepo({ ref: "refs/heads/main" }), null);
});

test("a root matches its repository however the url was written", () => {
  for (const url of [
    "https://github.com/o/r",
    "https://github.com/o/r/tree/main/src",
    "https://raw.githubusercontent.com/o/r/HEAD/src/index.ts",
  ]) {
    assert.equal(rootMatchesRepo(url, "o/r"), true, url);
  }
  assert.equal(rootMatchesRepo("https://github.com/o/other", "o/r"), false);
  assert.equal(rootMatchesRepo("https://example.com/docs", "o/r"), false);
  assert.equal(rootMatchesRepo(null, "o/r"), false);
});
