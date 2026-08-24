import "./test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { stubDb } from "./test-db";
import {
  anonOwner,
  callerHash,
  anonRateLimited,
  ANON_TOOLS,
  ANON_PER_MINUTE,
  ANON_PER_DAY,
} from "./anon";

const req = (headers: Record<string, string> = {}) =>
  new Request("https://mozg.sh/mcp/public", { method: "POST", headers });

/**
 * The door with no lock on it, so what matters is the shape of the opening:
 * which tools are behind it, and that one caller cannot close it for everyone.
 */

test("only read tools are reachable without an account", () => {
  for (const t of ["brain_search", "brain_find", "brain_read", "brain_list", "brain_brief"]) {
    assert.equal(ANON_TOOLS.has(t), true, t);
  }
  // Anything that writes, spends our inference, or owns something. A denylist
  // would let the next tool added default to reachable; this must not.
  for (const t of [
    "brain_write",
    "brain_write_batch",
    "brain_add_source",
    "brain_create",
    "brain_refresh",
    "brain_feedback",
    "library_add",
    "gen_run",
  ]) {
    assert.equal(ANON_TOOLS.has(t), false, t);
  }
});

test("callers are separated by address, and the address is never stored", () => {
  const a = callerHash(req({ "x-forwarded-for": "203.0.113.9" }));
  const b = callerHash(req({ "x-forwarded-for": "203.0.113.10" }));
  assert.notEqual(a, b);
  // Stable for the same caller, or the rate limit would reset every call.
  assert.equal(a, callerHash(req({ "x-forwarded-for": "203.0.113.9" })));
  // Behind nginx the header carries the chain; only the left-most is the client.
  assert.equal(a, callerHash(req({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })));
  // A hash, not the address.
  assert.doesNotMatch(a, /203\.0\.113/);
  assert.match(a, /^[0-9a-f]{32}$/);
});

test("the anonymous principal owns nothing and is on the free plan", () => {
  const owner = anonOwner(req({ "x-forwarded-for": "203.0.113.9" }));
  assert.equal(owner.userId, "anon");
  assert.equal(owner.plan, "free");
  // The paywall answers "what may this read" off userId alone, so a principal
  // with no library and no purchases already means "free public catalogue".
  assert.ok(owner.ipHash);
});

test("a caller is stopped at its own ceiling, not at everyone's", async () => {
  stubDb(() => [{ minute: ANON_PER_MINUTE - 1, day: 10 }]);
  assert.equal(await anonRateLimited("hash"), null);

  stubDb(() => [{ minute: ANON_PER_MINUTE, day: 10 }]);
  assert.match((await anonRateLimited("hash"))!, /a minute/);

  stubDb(() => [{ minute: 1, day: ANON_PER_DAY }]);
  assert.match((await anonRateLimited("hash"))!, /Daily limit/);
});

test("the rate query counts this caller only", async () => {
  let sql = "";
  stubDb((text, params) => {
    sql = text;
    assert.equal(params[0], "the-hash");
    return [{ minute: 0, day: 0 }];
  });
  await anonRateLimited("the-hash");
  assert.match(sql.replace(/\s+/g, " "), /where caller_ip_hash = \$1/);
});
