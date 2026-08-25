import "./test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { stubDb } from "./test-db";
import { signupFunnel } from "./attribution";
import { ANON_USER_ID } from "./anon";

/** Run the funnel against a stub and hand back the SQL it issued. */
function capture(days: number | null) {
  let sql = "";
  let params: unknown[] = [];
  stubDb((text, p) => {
    sql = text;
    params = p;
    return [];
  });
  return signupFunnel(days).then(() => ({ sql, params }));
}

test("the anonymous metering row is excluded, by the same constant that names it", async () => {
  // It is one row carrying the busiest call count on the table. Counted as a
  // signup it lands in the catch-all bucket and makes the channel nobody
  // tagged look like the one that works.
  const { params } = await capture(30);
  assert.equal(params[1], ANON_USER_ID);
});

test("both doors into MCP count as connected", async () => {
  // adminUsers already got this wrong once: counting only mcp_tokens showed an
  // OAuth connector user as "never connected" with their calls in the next
  // column. Here that would blame the channel for a step the person passed.
  const { sql } = await capture(30);
  assert.match(sql, /mcp_tokens/);
  assert.match(sql, /"oauthAccessToken"/);
});

test("all time is a null window, not a very large one", async () => {
  const { params } = await capture(null);
  assert.equal(params[0], null);
});
