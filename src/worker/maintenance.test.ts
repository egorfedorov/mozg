import "@/lib/test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { stubDb } from "@/lib/test-db";
import { closeAbandonedRuns, examStaleBrains } from "./maintenance";

/**
 * The sweep that closes sittings nobody is running any more. Production had
 * eighteen of them, the oldest forty-one hours old, and a brain whose latest run
 * says "running" reads to the operator as busy rather than as never scored.
 *
 * What matters here is not that it runs but *what it dares touch*: autoscale
 * runs two workers, so a sweep without an age guard would kill a live sitting
 * and lose the judge calls already paid for.
 */

test("closeAbandonedRuns only touches runs older than the age guard", async () => {
  let seen = "";
  stubDb((text) => {
    seen = text;
    return [{ id: "run-1" }, { id: "run-2" }];
  });

  const closed = await closeAbandonedRuns();

  assert.equal(closed, 2);
  const sql = seen.replace(/\s+/g, " ");
  // Only open runs, and only ones past the window — never "everything running",
  // which is what a boot-time sweep would have meant with two workers.
  assert.match(sql, /update check_runs/i);
  assert.match(sql, /status = 'running'/);
  assert.match(sql, /started_at < now\(\) - interval '\d+ minutes'/);
  // Closed as failed with a reason, not silently deleted: the sitting happened,
  // it just did not finish, and the next examStaleBrains pass needs to see that.
  assert.match(sql, /set status = 'failed'/);
  assert.match(sql, /error = coalesce\(error,/);
  assert.match(sql, /finished_at = now\(\)/);
});

test("closeAbandonedRuns reports zero when there is nothing to close", async () => {
  stubDb(() => []);
  assert.equal(await closeAbandonedRuns(), 0);
});

/**
 * The backstop that re-sits exams, and the reason it stopped being a backstop.
 *
 * The refresh pass re-reads 500 pages four times a day, so "material moved
 * since the last score" is true of most of the catalogue most days — and the
 * queue stayed 58 brains deep forever. $72 of $81 of exam spend in the week to
 * 08-19 went to brains that have never been searched once.
 *
 * What matters here is what it dares enqueue: a brain somebody is asking must
 * still re-sit the moment its material moves, and a brain nobody is asking
 * must not be re-sat until the interval says so.
 */
test("a brain nobody asks waits for the interval; a brain somebody asks does not", async () => {
  // No rows back on purpose: enqueueExam would open a real pg-boss connection,
  // and what is under test is the SELECT that decides who gets there at all.
  let seen = "";
  stubDb((text) => {
    seen = text;
    return [];
  });

  assert.deepEqual(await examStaleBrains(10), []);

  // Still the original staleness test — a scored brain whose material has not
  // moved is never a candidate, however much demand it has.
  assert.match(seen, /content_changed_at > b\.score_at/);
  // Recent demand is the exemption, and it is demand for THIS brain.
  assert.match(seen, /tool = 'brain_search'/);
  assert.match(seen, /brain_id = b\.id/);
  // Without demand there is still a floor, so a score never freezes outright.
  assert.match(seen, /b\.score_at < now\(\) - interval '7 days'/);
  // A brain that has never been scored skips both guards: it has no score to
  // age and no demand yet to earn, and it is the one that most needs a number.
  assert.match(seen, /b\.score_at is null\s+or b\.score_at < now/);
});
