import "@/lib/test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { stubDb } from "@/lib/test-db";
import { closeAbandonedRuns } from "./maintenance";

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
