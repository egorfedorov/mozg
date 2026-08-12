import "./test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { symlinkTarget } from "./page";

/**
 * The case this was written for: ant-design's AGENTS.md is a symlink to
 * CLAUDE.md, raw.githubusercontent serves the target path as the whole file,
 * and mozg ingested nine characters and lost the source.
 *
 * The negative cases matter more than the positive one. This turns a fetched
 * body into a URL the crawler then goes and reads, so anything it accepts
 * loosely is a page deciding where mozg fetches from next.
 */

const RAW = "https://raw.githubusercontent.com/ant-design/ant-design/HEAD/AGENTS.md";

test("a symlink body resolves against the file's own directory", () => {
  assert.equal(
    symlinkTarget(RAW, "CLAUDE.md"),
    "https://raw.githubusercontent.com/ant-design/ant-design/HEAD/CLAUDE.md",
  );
});

test("trailing whitespace from the server does not stop it", () => {
  assert.equal(
    symlinkTarget(RAW, "CLAUDE.md\n"),
    "https://raw.githubusercontent.com/ant-design/ant-design/HEAD/CLAUDE.md",
  );
});

test("a relative path walks up as git wrote it", () => {
  assert.equal(
    symlinkTarget(RAW, "../docs/AGENTS.md"),
    "https://raw.githubusercontent.com/ant-design/ant-design/docs/AGENTS.md",
  );
});

test("only raw.githubusercontent serves symlinks this way", () => {
  assert.equal(symlinkTarget("https://example.com/page", "CLAUDE.md"), null);
});

test("real prose is never a link target", () => {
  assert.equal(symlinkTarget(RAW, "See CLAUDE.md for the rules."), null);
  assert.equal(symlinkTarget(RAW, "# Title"), null);
});

test("a body with no extension is not followed", () => {
  assert.equal(symlinkTarget(RAW, "CLAUDE"), null);
  assert.equal(symlinkTarget(RAW, "docs/guide"), null);
});

test("an absolute URL in the body is never followed", () => {
  // Otherwise any repository could point mozg's fetcher at any host it liked.
  assert.equal(symlinkTarget(RAW, "https://evil.example/x.md"), null);
  assert.equal(symlinkTarget(RAW, "//evil.example/x.md"), null);
});

test("a link to itself is refused rather than fetched twice", () => {
  assert.equal(symlinkTarget(RAW, "AGENTS.md"), null);
});

test("an empty body is not a symlink", () => {
  assert.equal(symlinkTarget(RAW, "   \n "), null);
});

test("a link target is recognised at a length the thin-page guard rejects", () => {
  // Order of the two guards in fetchPageText, pinned. A symlink body is nine
  // characters — far under MIN_TEXT — so a refactor that checks "too short to
  // extract from" before following the link turns every symlinked AGENTS.md
  // back into a failed source, and does it silently.
  const body = "CLAUDE.md";
  assert.ok(body.length < 30);
  assert.ok(symlinkTarget(RAW, body));
});
