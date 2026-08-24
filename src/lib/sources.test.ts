import "./test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { isCrawlRoot, CRAWL_ROOTS_SQL, CRAWL_ROOT_KINDS } from "./sources";

/**
 * Thirteen places branched on the string 'site' before a second root kind
 * existed. Each was a place where a repo root would have been handed to the
 * page ingester instead of the crawler, and turned into notes about a JSON
 * file. The predicate is the fix; this is the check that both dialects of it
 * stay in step.
 */
test("every crawl root is a root in both TypeScript and SQL", () => {
  for (const kind of CRAWL_ROOT_KINDS) {
    assert.equal(isCrawlRoot(kind), true, kind);
    assert.ok(CRAWL_ROOTS_SQL.includes(`'${kind}'`), `${kind} missing from SQL`);
  }
  // Material, not roots — these go to the ingest queue and must never be
  // excluded from the "retry the failed sources" sweeps.
  for (const kind of ["url", "text", "file", "image"]) {
    assert.equal(isCrawlRoot(kind), false, kind);
    assert.ok(!CRAWL_ROOTS_SQL.includes(`'${kind}'`), `${kind} leaked into SQL`);
  }
});

test("the SQL fragment is a usable in-list", () => {
  assert.match(CRAWL_ROOTS_SQL, /^\('[a-z]+'(, '[a-z]+')*\)$/);
});
