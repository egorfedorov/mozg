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

/**
 * The refresh pass, and the thing that made it unaffordable: it was blind to
 * demand while the catalogue grew past what its own promise could cover.
 *
 * Production, the day this changed: 13,357 URL sources, 11,208 of them in
 * brains nobody had searched in a month, 6,953 due at once against a pass that
 * checks 2,000 a day. A blind pass does not merely waste the fetches — it puts
 * the pages somebody IS asking about behind five thousand nobody wants.
 */

test("refresh holds idle brains to a longer window and serves demand first", async () => {
  const seen: string[] = [];
  stubDb((text) => {
    seen.push(text.replace(/\s+/g, " "));
    return text.includes("count(*)") ? [{ n: 0 }] : [];
  });

  const { refreshUrlSources } = await import("./maintenance");
  await refreshUrlSources();

  const batch = seen.find((s) => s.includes("order by")) ?? "";

  // Two windows, chosen per source by whether anyone is asking. Both present:
  // an idle brain is refreshed rarely, never "not at all" — it still has to be
  // able to earn its first search.
  assert.match(batch, /case when asked\.root is not null/);
  assert.match(batch, /then interval '3 days'/);
  assert.match(batch, /else interval '21 days'/);

  // Demand ahead of idleness in the queue. This is the half that stops a busy
  // brain waiting behind an abandoned one when more is due than fits.
  assert.match(batch, /order by \(asked\.root is not null\) desc/);

  // Rolled up to the family: searching a parent searches its children, so a
  // child of a busy parent is in demand even though no call carries its id.
  // Without this, stake-engine's five handles would have looked idle while
  // taking 4,486 searches between them.
  assert.match(batch, /coalesce\(kb\.parent_id, kb\.id\)/);
  assert.match(batch, /coalesce\(b\.parent_id, b\.id\)/);

  // The backlog is counted under the same rule it is served under, or "due"
  // reports a queue the pass is not actually working from.
  const count = seen.find((s) => s.includes("count(*)")) ?? "";
  assert.match(count, /case when asked\.root is not null/);
});

test("a named brain is refreshed whole, demand or not", async () => {
  const seen: string[] = [];
  stubDb((text) => {
    seen.push(text.replace(/\s+/g, " "));
    return text.includes("count(*)") ? [{ n: 0 }] : [];
  });

  const { refreshUrlSources } = await import("./maintenance");
  await refreshUrlSources(400, "11111111-1111-1111-1111-111111111111");

  const batch = seen.find((s) => s.includes("order by")) ?? "";
  // Somebody asked for this one by name. The window is skipped entirely —
  // "I checked the ones I felt like" is not an answer to "update my brain".
  assert.match(batch, /\$1::uuid is not null or s\.checked_at is null/);
});

/**
 * The pass runs every six hours; a monthly cap does not roll for weeks.
 * Production had 43 sources from one free account looping through it — queued,
 * re-read the budget, failed with the same sentence, four times a day, for the
 * rest of the month.
 */
test("a monthly budget failure is not retried inside the same month", async () => {
  let sql = "";
  stubDb((text) => {
    sql = text;
    return [];
  });

  const { requeueBudgetPaused } = await import("./maintenance");
  await requeueBudgetPaused();

  const flat = sql.replace(/\s+/g, " ");
  // Daily and rate limits still retry freely — those windows do roll.
  assert.match(flat, /error like 'daily budget:%'/);
  assert.match(flat, /error like 'rate limit:%'/);
  // The monthly one only once the calendar month has moved past the failure.
  assert.match(flat, /monthly budget:%' and processed_at < date_trunc\('month', now\(\)\)/);
});
