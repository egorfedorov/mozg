import "./test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { callTool } from "./mcp";
import { stubDb } from "./test-db";
import { PLANS } from "./plans";

const owner = { userId: "u1", tokenId: "t1", plan: PLANS.free };

/**
 * The refusal an agent gets when it guessed a handle. It used to say only
 * "call brain_list", and the agent that was sure enough to guess is the agent
 * that does not make that call — so the shelf rides along with the refusal.
 */
function shelfOnly(rows: object[]) {
  return (text: string) => {
    // resolveBrain finds nothing; the listing behind notFound answers.
    if (/from library l/.test(text) && /union all/.test(text)) return rows;
    return [];
  };
}

test("a wrong handle is answered with the shelf, nearest first", async () => {
  stubDb(
    shelfOnly([
      { handle: "mozg/slot-engine", title: "Slot engine" },
      { handle: "riso-print-style", title: "Riso print style" },
    ]),
  );

  const out = await callTool("brain_brief", { brain: "mozg/riso-print-illustration-style" }, owner);

  assert.equal(out.isError, true);
  assert.match(out.text, /No brain "mozg\/riso-print-illustration-style" is available/);
  // Both offered, and the one sharing "riso"/"print" leads.
  assert.ok(out.text.indexOf("riso-print-style") < out.text.indexOf("mozg/slot-engine"));
});

test("a missing brain argument is named as missing, not as a brain called \"\"", async () => {
  stubDb(shelfOnly([{ handle: "mozg/slot-engine", title: "Slot engine" }]));

  const out = await callTool("brain_brief", {}, owner);

  assert.equal(out.isError, true);
  assert.doesNotMatch(out.text, /No brain ""/);
  assert.match(out.text, /needs a brain name/);
  assert.match(out.text, /mozg\/slot-engine/);
});

test("an empty shelf says how to fill it instead of listing nothing", async () => {
  stubDb(shelfOnly([]));

  const out = await callTool("brain_brief", { brain: "whatever" }, owner);

  assert.equal(out.isError, true);
  assert.match(out.text, /brain_create/);
});
