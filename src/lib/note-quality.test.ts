import { test } from "node:test";
import assert from "node:assert/strict";
import { noteWarnings } from "./note-quality";

const rules = (t: string, b: string, k = "fact") => noteWarnings(t, b, k).map((w) => w.rule);

test("a good note warns about nothing", () => {
  assert.deepEqual(
    rules(
      "Budget pauses must not reach the error centre",
      "Throw a distinct BudgetPausedError in src/worker/ingest.ts so the worker " +
        "can skip both the retry and the app_errors row, because a deliberate " +
        "stop reported as a failure buries the real ones.",
      "rule",
    ),
    [],
  );
});

test("a note that points outside itself is flagged", () => {
  assert.ok(rules("Retry policy", "As shown above, the worker retries 3 times.").includes(
    "dangling-reference",
  ));
  assert.ok(rules("Retry policy", "См. выше — воркер повторяет 3 раза.").includes(
    "dangling-reference",
  ));
});

test("a fact with nothing concrete in it is flagged", () => {
  assert.ok(rules("Caching", "The cache should be cleared when it makes sense.").includes(
    "no-specifics",
  ));
  // A version, a path or a symbol is enough to clear it.
  assert.ok(!rules("Caching", "Clear extract_payload when the page hash moves.").includes(
    "no-specifics",
  ));
  assert.ok(!rules("Caching", "The TTL is 15 seconds.").includes("no-specifics"));
});

test("a body that restates its own title is flagged", () => {
  assert.ok(
    rules(
      "The worker retries failed jobs three times",
      "The worker retries failed jobs three times, using pg-boss defaults in src/worker/queue.ts.",
    ).includes("body-repeats-title"),
  );
});

test("a rule or pitfall with no reason is flagged, a fact is not", () => {
  assert.ok(rules("Always cap the batch", "Send at most 25 notes per call.", "rule").includes(
    "no-reason",
  ));
  assert.ok(!rules("Batch cap", "At most 25 notes per call.", "fact").includes("no-reason"));
  assert.ok(
    !rules(
      "Always cap the batch",
      "Send at most 25 notes per call, because one review queue is one person.",
      "rule",
    ).includes("no-reason"),
  );
});

// The whole design rests on this: these are hints, not gates. If any rule ever
// starts rejecting, an owner loses good notes to a regex reading English.
test("nothing here ever refuses — it only ever returns warnings", () => {
  const worst = noteWarnings("x", "as shown above, it works", "rule");
  assert.ok(worst.length > 0);
  assert.ok(worst.every((w) => typeof w.says === "string" && w.says.length > 0));
});
