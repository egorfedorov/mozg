import { test } from "node:test";
import assert from "node:assert/strict";
import { SIZE_LINES, countLines, displayPath, moduleOf, risksOf, weightOf } from "./change";

test("lines are counted the way a person counts them", () => {
  assert.equal(countLines(""), 0);
  assert.equal(countLines(undefined), 0);
  assert.equal(countLines("a"), 1);
  assert.equal(countLines("a\nb"), 2);
  assert.equal(countLines("a\nb\n"), 2);
  assert.equal(countLines("\n\n"), 2);
});

test("a module is a folder, one or two levels deep", () => {
  assert.equal(moduleOf("README.md"), "(root)");
  assert.equal(moduleOf(""), "(root)");
  assert.equal(moduleOf("src/app/layout.tsx"), "src/app");
  assert.equal(moduleOf("src/payments/charge.ts"), "src/payments");
  assert.equal(moduleOf("src/thing.ts"), "src");
  assert.equal(moduleOf("packages/core/src/x.ts"), "packages/core");
  assert.equal(moduleOf(".github/workflows/ci.yml"), ".github");
  assert.equal(moduleOf("Scripts\\Build.ps1"), "scripts");
  // One level under a container is the container itself, not the file.
  assert.equal(moduleOf("app/page.tsx"), "app");
  assert.equal(moduleOf("apps/web/app/page.tsx"), "apps/web");
  // A migrations folder is a module of its own, however deep it sits.
  assert.equal(moduleOf("src/db/migrations/0042_ledger.sql"), "src/db/migrations");
  assert.equal(moduleOf("prisma/migrations/x/migration.sql"), "prisma/migrations");
  assert.equal(moduleOf("db/Migrate/Foo.cs"), "db");
});

test("a path shows relative to its project, with home folded away", () => {
  assert.equal(displayPath("/work/forge/src/a.ts", "/work/forge"), "src/a.ts");
  assert.equal(displayPath("/work/forge/src/a.ts", "/work/forge/"), "src/a.ts");
  assert.equal(displayPath("/elsewhere/x.ts", "/work/forge"), "/elsewhere/x.ts");
});

test("risk follows the path, and SQL in code is still a migration", () => {
  assert.deepEqual(risksOf("src/db/migrations/0042.sql", 3, 0, ""), ["migration"]);
  assert.deepEqual(risksOf("migrations/001.ts", 3, 0, ""), ["migration"]);
  assert.deepEqual(risksOf("src/billing/charge.ts", 3, 0, ""), ["payments"]);
  assert.deepEqual(risksOf("src/auth/session.ts", 3, 0, ""), ["auth"]);
  assert.deepEqual(risksOf(".github/workflows/ci.yml", 3, 0, ""), ["config"]);
  assert.deepEqual(risksOf("src/thing.ts", 3, 0, "await db.query('ALTER TABLE t ADD COLUMN c')"), ["migration"]);
  assert.deepEqual(risksOf("src/thing.ts", 3, 0, ""), []);
  assert.deepEqual(risksOf("src/thing.ts", SIZE_LINES, 0, ""), ["size"]);
  assert.deepEqual(risksOf("src/thing.test.ts", 3, 0, ""), ["tests"]);
  // A test file is only a test, however long.
  assert.deepEqual(risksOf("src/thing.test.ts", SIZE_LINES, 0, ""), ["tests"]);
});

test("weight multiplies by every risk, and never goes below a half", () => {
  assert.equal(weightOf([]), 1);
  assert.equal(weightOf(["tests"]), 0.5);
  assert.equal(weightOf(["payments"]), 2);
  assert.equal(weightOf(["migration", "size"]), 3.75);
  assert.equal(weightOf(["tests", "size"]), 0.75);
});
