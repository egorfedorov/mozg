import "./test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { stubDb } from "./test-db";
import { CATALOG, syncAchievements, type UserStats } from "./achievements";

const ZERO: UserStats = {
  brains: 0,
  sources: 0,
  notes: 0,
  public_brains: 0,
  priced: 0,
  graded: 0,
  best_score: 0,
  calls: 0,
  bought: 0,
  sold: 0,
  reviews: 0,
  duels: 0,
  best_streak: 0,
  paid_topups: 0,
};

function stubStats(stats: UserStats): { inserted: string[][] } {
  const seen = { inserted: [] as string[][] };
  stubDb((text, params) => {
    if (/insert into achievements/.test(text)) {
      seen.inserted.push([...(params[1] as string[])]);
      return [];
    }
    if (/best_streak/.test(text)) return [stats as unknown as Record<string, unknown>] as object[];
    throw new Error(`unexpected query: ${text}`);
  });
  return seen;
}

test("nothing earned writes nothing", async () => {
  const seen = stubStats(ZERO);
  await syncAchievements("u1");
  assert.deepEqual(seen.inserted, []);
});

test("crossed thresholds are recorded, un-crossed are not", async () => {
  const seen = stubStats({ ...ZERO, brains: 5, best_score: 89, duels: 3, best_streak: 7 });
  await syncAchievements("u1");
  const kinds = seen.inserted.flat();
  // brains=5 crosses 1 and 5, not 10; score 89 misses the 90 bar.
  assert.deepEqual(
    kinds.sort(),
    ["duelist", "first_brain", "five_brains", "scholar", "week_streak"].sort(),
  );
});

test("every catalog kind has a unique kind and a positive goal", () => {
  assert.equal(new Set(CATALOG.map((a) => a.kind)).size, CATALOG.length);
  assert.equal(CATALOG.length, 20);
  for (const a of CATALOG) assert.ok(a.goal >= 1, a.kind);
});
