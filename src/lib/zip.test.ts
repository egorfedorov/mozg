import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { crc32, zip } from "./zip";

test("crc32 matches the value every other zip tool computes", () => {
  // The check value from the CRC-32 specification. If this drifts, archives
  // open everywhere and report themselves corrupt, which is the worst kind of
  // broken: it looks like the studio's tools are at fault.
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
});

test("a real unzip accepts what we write, and gets the bytes back", () => {
  const archive = zip([
    { name: "symbols/wild.png", body: Buffer.from("not really a png, but bytes") },
    { name: "atlas.json", body: Buffer.from(JSON.stringify({ frames: {} })) },
  ]);

  // Written by hand from the spec, so the only test worth having is whether
  // the tool a studio actually uses can open it.
  const dir = mkdtempSync(join(tmpdir(), "zip-"));
  const path = join(dir, "pack.zip");
  writeFileSync(path, archive);

  const listed = execFileSync("unzip", ["-l", path], { encoding: "utf8" });
  assert.match(listed, /symbols\/wild\.png/);
  assert.match(listed, /atlas\.json/);

  // -t verifies every entry's CRC against its stored bytes.
  const tested = execFileSync("unzip", ["-t", path], { encoding: "utf8" });
  assert.match(tested, /No errors detected/);

  const shown = execFileSync("unzip", ["-p", path, "atlas.json"], { encoding: "utf8" });
  assert.equal(shown, JSON.stringify({ frames: {} }));
});

test("two exports of the same content are the same bytes", () => {
  // Timestamps are fixed on purpose: a studio diffing yesterday's export
  // against today's should see what changed in the art, not that it was
  // exported twice.
  const entries = [{ name: "a.txt", body: Buffer.from("one") }];
  assert.deepEqual(zip(entries), zip(entries));
});
