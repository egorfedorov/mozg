import "./test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { callTool } from "./mcp";
import { stubDb } from "./test-db";
import type { TokenOwner } from "./tokens";

const owner: TokenOwner = { userId: "u1", tokenId: "t1", plan: "free" };

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

/**
 * A brain can honestly be yours two ways at once — buying a family both grants
 * it and shelves it — and the shelf query unions those branches, so each of
 * the eighteen slot-studio brains came back twice. Forty rows for twenty-two
 * brains, printed into the context window of every session that called
 * brain_list, and into every refusal that carried the shelf.
 *
 * The queries are guarded now; this pins the rule about the answer, which is
 * the one that has to hold whatever a future branch returns.
 */
test("a brain you hold two ways is offered once", async () => {
  stubDb(
    shelfOnly([
      { handle: "mozg/slot-studio", title: "Slot studio" },
      { handle: "mozg/slot-studio", title: "Slot studio" },
      { handle: "mozg/pixijs-casino", title: "PixiJS casino" },
    ]),
  );

  const out = await callTool("brain_brief", { brain: "mozg/nope" }, owner);

  const hits = out.text.split("mozg/slot-studio").length - 1;
  assert.equal(hits, 1, `offered ${hits} times:\n${out.text}`);
  assert.match(out.text, /mozg\/pixijs-casino/);
});

test("onePerHandle keeps the first row, which is the truer relationship", async () => {
  const { onePerHandle } = await import("./mcp");
  assert.deepEqual(
    onePerHandle([
      { handle: "a", access: "buyer" },
      { handle: "a", access: "added" },
      { handle: "b", access: "added" },
    ]),
    [
      { handle: "a", access: "buyer" },
      { handle: "b", access: "added" },
    ],
  );
});

/**
 * brain_find exists because reaching a brain used to require already knowing
 * it was there. On the day it was written the catalogue held twenty public
 * brains — Expo, Supabase, Drizzle, Playwright, the OWASP sheets, thousands of
 * notes each — every one read zero times, while the nine brains somebody had
 * been told about carried every call on the platform.
 */
test("brain_find's answer carries the evidence, not just the handle", async () => {
  const { foundText } = await import("./mcp");
  const out = foundText(
    "how does RLS work in supabase",
    [
      {
        handle: "mozg",
        slug: "supabase",
        title: "Supabase",
        answers: [{ title: "Row level security", snippet: "Enable RLS on every table." }],
      },
      { handle: "mozg", slug: "drizzle", title: "Drizzle", answers: [] },
    ],
    new Set(["mozg/drizzle"]),
  );

  assert.match(out, /mozg\/supabase/);
  // A handle that merely sounds right sends an agent to the wrong brain.
  assert.match(out, /Row level security: Enable RLS on every table\./);
  // Already reachable — offering it as a discovery reads like the server
  // cannot see its own shelf.
  assert.match(out, /mozg\/drizzle — Drizzle \(on your shelf\)/);
  // Ends in the call to make next, with the best match filled in.
  assert.match(out, /brain_search \{"brain": "mozg\/supabase"/);
});

test("brain_find says so plainly when the catalogue cannot help", async () => {
  stubDb(() => []);

  const out = await callTool("brain_find", { question: "how do I fold a paper crane" }, owner);

  assert.equal(out.results, 0);
  assert.match(out.text, /No public brain answers/);
  // Not a dead end: the honest next move is to say it is unverified.
  assert.match(out.text, /unverified/);
});

test("brain_find asks for a question, and names the argument", async () => {
  stubDb(() => []);
  const out = await callTool("brain_find", { question: "hi" }, owner);
  assert.equal(out.isError, true);
  assert.match(out.text, /needs a question/);
  // The message has to name the field, because the commonest way to reach it
  // is passing the right value under the wrong key.
  assert.match(out.text, /`question`/);
});

/**
 * brain_search takes `query`, so an agent that has just used it reaches for
 * the same key here. Refusing that was a round trip spent on the label of a
 * field whose value was already correct — and the old message blamed the
 * caller for passing "a brain name", which it had not done.
 */
test("brain_find accepts the argument name its sibling tool uses", async () => {
  stubDb(() => []);
  const out = await callTool("brain_find", { query: "how do cascading reels settle" }, owner);
  // Reaches the search rather than the argument complaint.
  assert.doesNotMatch(out.text, /needs a question/);
});

/**
 * The wall has to arrive before the work, not after it.
 *
 * A user watched an agent plan seventeen cutouts for three and a half minutes,
 * call gen_run, and get "could not charge the generation". Their reaction was
 * "so what's the point". Nothing was broken — the price was printed and the
 * refusal was correct — but the balance was only consulted at the moment of
 * spending, so everything before that was work they watched happen and could
 * not use.
 */
test("a project short of balance says so while there is still time to act", async () => {
  stubDb((text) => {
    if (/from gen_prices/.test(text)) return [{ role: "symbol", cents: 100 }];
    if (/balance_cents/.test(text)) return [{ balance_cents: 300 }];
    if (/from gen_projects/.test(text)) {
      return [{ id: "p1", title: "Tomb", style: "a bleached tomb", palette: null, owner_id: "u1" }];
    }
    if (/from gen_items/.test(text)) {
      return Array.from({ length: 5 }, (_, i) => ({
        id: `i${i}`,
        label: `sym-${i}`,
        role: "symbol",
        status: "planned",
        spec: null,
      }));
    }
    return [];
  });

  const out = await callTool("gen_project", { id: "p1" }, owner);

  // Five symbols at $1 against $3 of balance.
  assert.match(out.text, /\$2\.00 SHORT/);
  // Said before any generating, and it names every way out rather than only
  // the one that takes our money.
  assert.match(out.text, /BEFORE planning further work/);
  assert.match(out.text, /mozg\.sh\/settings/);
  assert.match(out.text, /apimart\.ai\/keys/);
  assert.match(out.text, /drop assets/);
});
