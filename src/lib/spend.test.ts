import "@/lib/test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { stubDb } from "@/lib/test-db";
import { holdScheduledSpend, platformSpentCents, spendSumSql, PLATFORM_DAILY_CENTS } from "./spend";

/**
 * The guard exists because the money was invisible: it lives in three tables
 * that nothing joins, and reading only `spend` shows pennies while the exam
 * lane burns $11 a day. So the thing worth testing is not the arithmetic —
 * it is that all three tables are still in the sum, and that the ceiling is a
 * ceiling rather than a suggestion.
 */

test("the spend sum reads all three tables money lands in", () => {
  const sql = spendSumSql("24 hours").replace(/\s+/g, " ");
  // Miss one and a whole lane's spend silently reads as zero — which is
  // exactly how a $11/day regression ran unnoticed for a week.
  assert.match(sql, /from sources/);
  assert.match(sql, /from check_runs/);
  assert.match(sql, /from spend/);
  // Each table has its own timestamp column: sources has no created_at,
  // check_runs has no created_at either.
  assert.match(sql, /processed_at > now\(\) - interval '24 hours'/);
  assert.match(sql, /started_at > now\(\) - interval '24 hours'/);
  assert.match(sql, /created_at > now\(\) - interval '24 hours'/);
});

test("the interval is validated, not trusted", () => {
  assert.throws(() => spendSumSql("1 day'; drop table brains --"), /bad interval/);
  assert.throws(() => spendSumSql("forever"), /bad interval/);
});

test("platformSpentCents returns what the sum found", async () => {
  stubDb(() => [{ cents: 1234 }]);
  assert.equal(await platformSpentCents(), 1234);
});

test("scheduled work is held once spend reaches the ceiling, not before", async () => {
  stubDb(() => [{ cents: PLATFORM_DAILY_CENTS - 1 }]);
  assert.equal((await holdScheduledSpend()).hold, false);

  stubDb(() => [{ cents: PLATFORM_DAILY_CENTS }]);
  assert.equal((await holdScheduledSpend()).hold, true);
});
