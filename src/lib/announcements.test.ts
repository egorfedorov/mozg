import "./test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { stubDb } from "./test-db";
import { formatAgentNotice, readLiveAnnouncements } from "./announcements";

/**
 * The bug this file exists to prevent shipped once and took the changelog down:
 * timestamptz arrives from node-postgres as a Date, the type said string, and
 * `.slice()` on it threw for every published news item. The queries now format
 * both timestamps in SQL — these tests assert the shape the callers depend on,
 * and that a Date leaking through would be caught here rather than in production.
 */

test("the live query asks the database for formatted timestamps", async () => {
  let seen = "";
  stubDb((text) => {
    seen = text;
    return [];
  });
  await readLiveAnnouncements();
  // Both, not just one: ends_at is what the banner renders "until 14:30" from.
  assert.match(seen, /to_char\(starts_at/);
  assert.match(seen, /to_char\(ends_at/);
});

test("an agent notice reads as one actionable line per entry", () => {
  const notice = formatAgentNotice([
    {
      id: "a1",
      kind: "maintenance",
      title: "Ingest paused for a deploy",
      body: "Searches keep working.\nSecond line is not shown.",
      starts_at: "2026-08-05T01:00:00Z",
      ends_at: "2026-08-05T01:30:00Z",
      to_agents: true,
    },
    { id: "a2", kind: "news", title: "Not for agents", body: "", starts_at: "2026-08-05T01:00:00Z", ends_at: null, to_agents: false },
  ]);
  assert.ok(notice);
  assert.match(notice, /^\[mozg maintenance\] Ingest paused for a deploy/);
  // First line of the body only: this rides along with every brain_list.
  assert.match(notice, /Searches keep working\./);
  assert.doesNotMatch(notice, /Second line/);
  // The window, so an agent can tell its user how long to wait.
  assert.match(notice, /until 2026-08-05 01:30 UTC/);
  // Entries not marked for agents stay out of the agent surface entirely.
  assert.doesNotMatch(notice, /Not for agents/);
});

test("no live announcements means no line at all, not an empty one", () => {
  assert.equal(formatAgentNotice([]), null);
});
