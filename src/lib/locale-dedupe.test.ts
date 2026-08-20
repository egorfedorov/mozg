import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * The two-cookies-one-name migration, as arithmetic on a header.
 *
 * The language cookie used to be host-only, so it stayed on whichever host it
 * was picked on. It is now scoped to .mozg.sh — and writing the new one does
 * NOT replace the old, because browsers key cookies by (name, domain, path).
 * Both arrive, host-only first, and the server reads that one: pick Russian on
 * gen.mozg.sh and mozg.sh keeps showing the old language.
 *
 * The middleware carries the fix; this pins the two decisions it rests on.
 */

const NAME = "mozg_lang";

function count(raw: string): number {
  return raw.split(";").filter((c) => c.trim().startsWith(`${NAME}=`)).length;
}

/** Keep the last copy — see preferSharedLocale in middleware.ts. */
function dedupe(raw: string): string {
  const parts = raw.split(";").map((c) => c.trim());
  const mine = parts.filter((c) => c.startsWith(`${NAME}=`));
  const rest = parts.filter((c) => !c.startsWith(`${NAME}=`));
  return [...rest, mine[mine.length - 1]].join("; ");
}

test("one cookie is not a duplicate and is left alone", () => {
  assert.equal(count("mozg_lang=ru; mozg_src=direct"), 1);
  assert.equal(count("mozg_src=direct"), 0);
  // A cookie whose name merely starts the same must not be counted.
  assert.equal(count("mozg_lang_old=ru"), 0);
});

test("two are spotted, and the newer one wins", () => {
  // Browsers send the more specific first: the host-only leftover leads, the
  // domain-scoped choice just made trails it.
  const raw = "mozg_lang=en; mozg_src=direct; mozg_lang=ru";
  assert.equal(count(raw), 2);
  assert.equal(dedupe(raw), "mozg_src=direct; mozg_lang=ru");
});

test("deduping keeps everything else on the header", () => {
  const raw = "a=1; mozg_lang=en; b=2; mozg_lang=ru; c=3";
  const out = dedupe(raw);
  for (const other of ["a=1", "b=2", "c=3"]) {
    assert.ok(out.includes(other), `dropped ${other}`);
  }
  assert.equal(count(out), 1);
  assert.ok(out.endsWith("mozg_lang=ru"));
});
