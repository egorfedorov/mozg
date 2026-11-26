import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { indexAll } from "@/core/indexer";
import { Store } from "@/core/store";
import type { Explain } from "@/core/types";
import { NUDGE_EVERY_MS, onBeforeEdit, onSessionStart, onStop, type HookDeps, type HookInput } from "./hooks";

// Never the person's real logs: a test that reads them is a test that leaks.
process.env.MOZG_CLAUDE_PROJECTS = await mkdtemp(join(tmpdir(), "mozg-hooks-nologs-"));

const CWD = "/work/forge";
const NOW = new Date(2026, 10, 25, 16, 0, 0);

function line(obj: unknown): string {
  return JSON.stringify(obj) + "\n";
}

const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

function edit(id: string, file: string, session = "s1", at = minutesAgo(10), lines = 2): string {
  return line({
    type: "assistant", sessionId: session, cwd: CWD, timestamp: at,
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id, name: "Edit", input: { file_path: `${CWD}/${file}`, old_string: "a", new_string: Array.from({ length: lines }, (_, i) => `line ${i}`).join("\n") } }],
    },
  });
}

function done(id: string, at = minutesAgo(9)): string {
  return line({
    type: "user", timestamp: at,
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: "ok" }] },
    permissionDecision: { decision: "accept", source: "config" },
  });
}

const stop = (transcript: string, extra: Partial<HookInput> = {}): HookInput => ({
  session_id: "s1",
  transcript_path: transcript,
  cwd: CWD,
  hook_event_name: "Stop",
  ...extra,
});

async function setup(text: string) {
  const root = await mkdtemp(join(tmpdir(), "mozg-hooks-logs-"));
  const dir = await mkdtemp(join(tmpdir(), "mozg-hooks-store-"));
  const transcript = join(root, "-work-forge", "s1.jsonl");
  await mkdir(join(root, "-work-forge"), { recursive: true });
  await writeFile(transcript, text);
  const store = await Store.open(dir);
  await indexAll(store, { root });
  return { transcript, dir, store };
}

test("a turn that left changes in unexplained modules is mentioned once", async () => {
  const { transcript, store } = await setup(edit("a", "src/payments/charge.ts") + done("a") + edit("b", "src/auth/session.ts") + done("b"));
  const deps: HookDeps = { store, now: NOW };

  const out = (await onStop(stop(transcript), deps))!;
  assert.deepEqual(Object.keys(out), ["systemMessage"]);
  assert.match(
    String(out.systemMessage),
    /^mozg: 2 changes in src\/payments, src\/auth went into modules you have not explained\. A one-minute explain-back makes them yours\. Say 'explain' when you have a minute\.$/,
  );
  assert.equal(store.nudgeAt("s1"), NOW.toISOString());

  // The same session is not told again for a while, even if it keeps editing.
  await appendFile(transcript, edit("c", "src/ui/board.tsx") + done("c"));
  assert.equal(await onStop(stop(transcript), deps), null);

  const later = new Date(NOW.getTime() + NUDGE_EVERY_MS + 1000);
  assert.ok(await onStop(stop(transcript), { store, now: later }));
});

test("a turn that only touched explained modules says nothing", async () => {
  const { transcript, store } = await setup(edit("a", "src/payments/charge.ts") + done("a"));
  const pass: Explain = {
    id: "e", change: store.changes[0].id, project: CWD, module: "src/payments", question: "q",
    answer: "a long enough answer", verdict: "explained", why: "", evidence: null, bug: null,
    at: minutesAgo(8), examiner: "test",
  };
  await store.addExplain(pass);
  assert.equal(await onStop(stop(transcript), { store, now: NOW }), null);
  assert.equal(store.nudgeAt("s1"), null);
});

test("a small change in an explained module is not worth a nudge; a rewrite is", async () => {
  const { transcript, store } = await setup(edit("a", "src/payments/charge.ts") + done("a"));
  await store.addExplain({
    id: "e", change: store.changes[0].id, project: CWD, module: "src/payments", question: "q",
    answer: "a long enough answer", verdict: "explained", why: "", evidence: null, bug: null,
    at: minutesAgo(8), examiner: "test",
  });
  await appendFile(transcript, edit("b", "src/payments/refund.ts", "s1", minutesAgo(5)) + done("b", minutesAgo(4)));
  assert.equal(await onStop(stop(transcript), { store, now: NOW }), null);

  // The agent rewrites the module: the explanation no longer describes it.
  await appendFile(transcript, edit("c", "src/payments/refund.ts", "s1", minutesAgo(2), 120) + done("c", minutesAgo(1)));
  const out = (await onStop(stop(transcript), { store, now: NOW }))!;
  // The change the person already explained is not counted against them.
  assert.match(String(out.systemMessage), /^mozg: 2 changes in src\/payments went into modules you have not explained\./);
});

test("firm asks the agent to offer the explain-back before stopping, once", async () => {
  const { transcript, store } = await setup(edit("a", "src/payments/charge.ts") + done("a") + edit("b", "src/auth/session.ts") + done("b"));
  await store.setSettings({ nudge: "firm" });

  const out = (await onStop(stop(transcript), { store, now: NOW }))!;
  assert.equal(out.decision, "block");
  assert.match(String(out.reason), /Offer a 60-second explain-back[\s\S]*If the user declines/);
  assert.match(String(out.systemMessage), /2 changes in src\/payments, src\/auth/);

  // Already continuing because of a stop hook: never twice in one turn.
  await store.setSettings({ nudge: "firm" });
  const again = new Date(NOW.getTime() + NUDGE_EVERY_MS + 1000);
  assert.equal((await onStop(stop(transcript, { stop_hook_active: true }), { store, now: again }))!.decision, undefined);
});

test("off means off", async () => {
  const { transcript, store } = await setup(edit("a", "src/payments/charge.ts") + done("a") + edit("b", "src/auth/session.ts") + done("b"));
  await store.setSettings({ nudge: "off" });
  assert.equal(await onStop(stop(transcript), { store, now: NOW }), null);
});

test("a stop that cannot read the transcript neither fails nor invents work", async () => {
  const { transcript, store } = await setup(edit("a", "src/payments/charge.ts") + done("a"));
  // No transcript path: there is nothing new to read, so nothing is said.
  assert.equal(await onStop({ session_id: "s1", cwd: CWD, hook_event_name: "Stop" }, { store, now: NOW }), null);
  // A path that cannot be read is not a reason to fail the session: what the
  // store already knows about it still counts.
  assert.ok(await onStop(stop(join(transcript, "..", "missing.jsonl")), { store, now: NOW }));
  // A session it has never seen has nothing to be told about.
  assert.equal(await onStop(stop(transcript, { session_id: "unseen" }), { store, now: NOW }), null);
});

test("session start tells the agent what is worth explaining, briefly", async () => {
  const { store } = await setup(edit("a", "src/payments/charge.ts") + done("a") + edit("b", "src/auth/session.ts") + done("b"));
  const out = (await onSessionStart({ session_id: "s2", cwd: CWD, hook_event_name: "SessionStart", source: "startup" }, { store, now: NOW }))!;
  const specific = out.hookSpecificOutput as { hookEventName: string; additionalContext: string };
  assert.equal(specific.hookEventName, "SessionStart");
  assert.match(specific.additionalContext, /^\[mozg\] ownership today 0%; streak 0 days\. Worth explaining: src\/auth, src\/payments\. /);
  assert.match(specific.additionalContext, /Do not bring it up unprompted\.$/);
  assert.ok(specific.additionalContext.length < 420, "a session start is a hint, not a briefing");
});

test("the first session start reads the past in the background", async () => {
  let started = 0;
  const store = Store.blank(await mkdtemp(join(tmpdir(), "mozg-hooks-blank-")));
  const out = (await onSessionStart({ cwd: CWD, hook_event_name: "SessionStart" }, { store, now: NOW, indexInBackground: () => started++ }))!;
  assert.equal(started, 1);
  assert.match(String((out.hookSpecificOutput as { additionalContext: string }).additionalContext), /^\[mozg\] Installed and watching/);
});

test("a hidden project is neither briefed nor nudged", async () => {
  const { store, transcript } = await setup(edit("a", "src/payments/charge.ts") + done("a"));
  await store.setSettings({ hidden: [CWD] });
  const deps: HookDeps = { store, now: NOW };
  assert.equal(await onSessionStart({ session_id: "s2", cwd: CWD, hook_event_name: "SessionStart", source: "startup" }, deps), null);
  assert.equal(await onStop(stop(transcript), deps), null);
});

test("a session in an unknown folder is not briefed about some other project", async () => {
  const { store } = await setup(edit("a", "src/payments/charge.ts") + done("a"));
  const out = await onSessionStart({ session_id: "s2", cwd: "/somewhere/else", hook_event_name: "SessionStart" }, { store, now: NOW });
  assert.equal(out, null);
});

const aboutTo = (file: string, extra: Partial<HookInput> = {}): HookInput => ({
  session_id: "s1",
  hook_event_name: "PreToolUse",
  tool_name: "Edit",
  tool_input: { file_path: `${CWD}/${file}`, old_string: "a", new_string: "b" },
  cwd: CWD,
  ...extra,
});

test("an edit in a module nobody explained is put to the person, once per session", async () => {
  const { store, transcript } = await setup(edit("a", "src/payments/charge.ts") + done("a") + edit("b", "src/auth/session.ts") + done("b"));
  const deps: HookDeps = { store, now: NOW };

  const first = (await onBeforeEdit(aboutTo("src/payments/charge.ts", { transcript_path: transcript }), deps))!;
  assert.deepEqual(Object.keys(first.hookSpecificOutput as object).sort(), ["hookEventName", "permissionDecision", "permissionDecisionReason"]);
  const out = first.hookSpecificOutput as { hookEventName: string; permissionDecision: string; permissionDecisionReason: string };
  assert.deepEqual([out.hookEventName, out.permissionDecision], ["PreToolUse", "ask"]);
  assert.match(out.permissionDecisionReason, /src\/payments is not explained yet/);

  assert.equal(await onBeforeEdit(aboutTo("src/payments/refund.ts"), deps), null, "asked about this module already in this session");
  assert.match(
    JSON.stringify((await onBeforeEdit(aboutTo("src/auth/session.ts"), deps))!.hookSpecificOutput),
    /src\/auth is not explained yet/,
    "another module is still asked about",
  );
  assert.equal((await Store.open(store.dir)).askedAt("s1", "src/payments"), NOW.toISOString(), "and it is on the store, not only in memory");
  assert.equal(await onBeforeEdit(aboutTo("src/payments/charge.ts"), { store: await Store.open(store.dir), now: NOW }), null, "so a fresh process knows too");
});

test("an explained module costs no prompt, and a rewritten one costs one", async () => {
  const text = edit("a", "src/payments/charge.ts") + done("a");
  const { store, transcript } = await setup(text);
  const deps: HookDeps = { store, now: NOW };
  await store.addExplain({
    id: "x", change: "a", project: CWD, module: "src/payments", question: "q", answer: "a long enough answer",
    verdict: "explained", why: "", evidence: null, bug: null, at: minutesAgo(5), examiner: "t",
  });
  assert.equal(await onBeforeEdit(aboutTo("src/payments/charge.ts"), deps), null, "it is theirs");

  // The agent has since rewritten it, in lines nobody has read into the store yet.
  await appendFile(transcript, edit("c", "src/payments/charge.ts", "s1", minutesAgo(3), 120) + done("c", minutesAgo(2)));
  assert.equal((await onBeforeEdit(aboutTo("src/payments/charge.ts"), deps)), null, "until somebody reads those lines, the store still says it is theirs");
  const rewritten = (await onBeforeEdit(aboutTo("src/payments/charge.ts", { transcript_path: transcript }), deps))!;
  assert.match((rewritten.hookSpecificOutput as { permissionDecisionReason: string }).permissionDecisionReason, /was yours, but the agent has changed 121 lines/);
});

test("the gate keeps out of the way where it has nothing to say", async () => {
  const { store, transcript } = await setup(edit("a", "src/payments/charge.ts") + done("a"));
  const deps: HookDeps = { store, now: NOW };
  const ask = aboutTo("src/payments/charge.ts", { transcript_path: transcript });
  assert.match(JSON.stringify((await onBeforeEdit(ask, deps))!.hookSpecificOutput), /"permissionDecision":"ask"/, "to begin with, it asks");
  assert.equal(await onBeforeEdit({ ...ask, tool_name: "Bash", tool_input: { command: "ls" } }, deps), null, "not an edit");
  assert.equal(await onBeforeEdit({ ...ask, tool_input: {} }, deps), null, "no file named");
  assert.equal(await onBeforeEdit({ ...ask, session_id: undefined }, deps), null, "no session");
  assert.equal(await onBeforeEdit({ ...ask, permission_mode: "bypassPermissions" }, deps), null, "nobody to ask");
  assert.equal(await onBeforeEdit({ ...ask, tool_input: { notebook_path: `${CWD}/src/payments/nb.ipynb` } }, deps), null, "asked about this module already");
  await store.setSettings({ asks: false });
  assert.equal(await onBeforeEdit({ ...ask, tool_input: { file_path: `${CWD}/src/db/x.ts` } }, deps), null, "switched off");
  // A store with no folder is not one to decide from.
  assert.equal(await onBeforeEdit(aboutTo("src/payments/charge.ts"), { store: Store.blank(), now: NOW }), null);
});

test("every sentence the person reads at the end of a turn is one the languages are asked to translate", () => {
  // The language check finds a sentence by the name it is called through.
  // Called through another name, it stays English in every language, and
  // nothing says so.
  const out = execFileSync("npx", ["tsx", "scripts/i18n-check.ts", "--keys"], { cwd: new URL("../..", import.meta.url), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const asked = (JSON.parse(out) as { messages: string[][] }).messages.map(([sentence]) => sentence);
  for (const sentence of [
    "<0/> change in <1/> went into modules you have not explained.",
    "<0/> changes in <1/> went into modules you have not explained.",
    "A one-minute explain-back makes them yours.",
    "Say 'explain' when you have a minute.",
  ])
    assert.ok(asked.includes(sentence), sentence);
});

test("the module the session changed most is named first", async () => {
  const { transcript, store } = await setup(
    edit("a", "src/ui/board.tsx") + done("a") + edit("b", "src/api/one.ts") + done("b") + edit("c", "src/api/two.ts") + done("c") + edit("d", "src/db/x.ts") + done("d"),
  );
  const out = (await onStop(stop(transcript), { store, now: NOW }))!;
  assert.match(String(out.systemMessage), /^mozg: 4 changes in src\/api, src\/ui, src\/db went into modules you have not explained\./);
});
