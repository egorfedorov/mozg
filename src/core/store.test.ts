import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFile, mkdtemp, mkdir, readFile, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { indexAll, indexFile, listLogs } from "./indexer";
import { tryHold, withLock } from "./lock";
import { Store } from "./store";
import type { Change } from "./types";

const SOURCE = { path: "", offset: 0, length: 0 };

function change(id: string, at = "2026-11-25T10:00:00.000Z"): Change {
  return {
    id, toolUseId: `t-${id}`, session: "s", project: "/p", file: "src/a.ts", module: "src", tool: "edit",
    at, added: 1, removed: 0, weight: 1, risks: [], goAheadMs: null, approvedBy: "unknown", source: SOURCE,
  };
}

async function tmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), "mozg-store-"));
}

test("changes are appended and come back unique", async () => {
  const dir = await tmp();
  const store = await Store.open(dir);
  await store.record([change("a"), change("b")], {});
  await store.record([change("b"), change("c")], {});
  assert.deepEqual(store.changes.map((c) => c.id), ["a", "b", "c"]);
  assert.equal((await readFile(join(dir, "changes.ndjson"), "utf8")).trim().split("\n").length, 3);

  const reopened = await Store.open(dir);
  assert.deepEqual(reopened.changes.map((c) => c.id), ["a", "b", "c"]);
});

test("two writers on one folder both land", async () => {
  const dir = await tmp();
  const a = await Store.open(dir);
  const b = await Store.open(dir);
  await Promise.all([a.record([change("a")], {}), b.record([change("b")], {})]);
  const reopened = await Store.open(dir);
  assert.deepEqual(reopened.changes.map((c) => c.id).sort(), ["a", "b"]);
});

test("a torn last line costs one change, not the file", async () => {
  const dir = await tmp();
  await Store.open(dir).then((s) => s.record([change("a")], {}));
  await appendFile(dir + "/changes.ndjson", '{"id":"half"');
  const reopened = await Store.open(dir);
  assert.deepEqual(reopened.changes.map((c) => c.id), ["a"]);
});

test("explain-backs and settings survive a reopen", async () => {
  const dir = await tmp();
  const store = await Store.open(dir);
  await store.addExplain({
    id: "x1", change: "c1", project: "/p", module: "src", question: "q", answer: "a",
    verdict: "explained", why: "w", evidence: null, bug: { found: true, note: "n" }, at: "2026-11-25T10:00:00.000Z", examiner: "test",
  });
  await store.setSettings({ nudge: "firm" });
  await store.markNudged("s1", "2026-11-25T10:00:00.000Z");
  const reopened = await Store.open(dir);
  assert.equal(reopened.explains.length, 1);
  assert.equal(reopened.explains[0].bug?.note, "n");
  assert.equal(reopened.settings.nudge, "firm");
  assert.equal(reopened.nudgeAt("s1"), "2026-11-25T10:00:00.000Z");
  assert.equal(reopened.nudgeAt("s2"), null);
  // Recording the same explain again replaces it.
  await reopened.addExplain({ ...reopened.explains[0], verdict: "not_yet" });
  assert.equal((await Store.open(dir)).explains[0].verdict, "not_yet");
});

test("a store with no folder keeps everything in memory", () => {
  const store = Store.blank();
  return store.record([change("a")], {}).then(() => {
    assert.equal(store.changes.length, 1);
  });
});

test("the lock takes turns and steals a dead one", async () => {
  const dir = await tmp();
  const order: string[] = [];
  let held: () => void = () => {};
  const holding = new Promise<void>((resolve) => (held = resolve));
  const slow = withLock(dir, async () => {
    order.push("slow-start");
    held();
    await new Promise((r) => setTimeout(r, 150));
    order.push("slow-end");
  });
  // Only once the first holder has the lock does the second one start waiting.
  await holding;
  const quick = withLock(dir, async () => {
    order.push("quick");
  });
  await Promise.all([slow, quick]);
  assert.deepEqual(order, ["slow-start", "slow-end", "quick"]);

  // A lock older than ten seconds belongs to a process that died.
  await writeFile(join(dir, "lock"), "123");
  const old = new Date(Date.now() - 60_000);
  await (await import("node:fs/promises")).utimes(join(dir, "lock"), old, old);
  await withLock(dir, async () => order.push("after-stale"));
  assert.equal(order[3], "after-stale");
});

function line(obj: unknown): string {
  return JSON.stringify(obj) + "\n";
}

function edit(id: string, file: string): string {
  return line({
    type: "assistant", sessionId: "s", cwd: "/p", timestamp: "2026-11-25T10:00:00.000Z",
    message: { role: "assistant", content: [{ type: "tool_use", id, name: "Edit", input: { file_path: `/p/${file}`, old_string: "a", new_string: "b" } }] },
  });
}

function done(id: string): string {
  return line({
    type: "user", timestamp: "2026-11-25T10:00:02.000Z",
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: "ok" }] },
  });
}

test("a log is read from where it was left off, and skipped when untouched", async () => {
  const root = await tmp();
  const store = await Store.open(await tmp());
  const path = join(root, "a.jsonl");
  await writeFile(path, edit("a", "src/one.ts") + done("a"));

  assert.equal((await indexFile(store, path)).changes, 1);
  assert.equal((await indexFile(store, path)).changes, 0, "nothing new");

  await appendFile(path, edit("b", "src/two.ts") + done("b"));
  assert.equal((await indexFile(store, path)).changes, 1);
  assert.deepEqual(store.changes.map((c) => c.file), ["src/one.ts", "src/two.ts"]);
});

test("a half-written last entry waits for the rest", async () => {
  const root = await tmp();
  const store = await Store.open(await tmp());
  const path = join(root, "a.jsonl");
  const second = edit("b", "src/two.ts") + done("b");
  await writeFile(path, edit("a", "src/one.ts") + done("a") + second.slice(0, 30));
  assert.equal((await indexFile(store, path)).changes, 1);
  await appendFile(path, second.slice(30));
  assert.equal((await indexFile(store, path)).changes, 1);
});

test("subagent logs nested under a session are found too", async () => {
  const root = await tmp();
  const project = join(root, "-Users-x-forge");
  const nested = join(project, "11111111-1111-4111-8111-111111111111", "subagents", "workflows", "wf_abc-123");
  await mkdir(nested, { recursive: true });
  await writeFile(join(project, "11111111-1111-4111-8111-111111111111.jsonl"), edit("a", "src/one.ts") + done("a"));
  await writeFile(join(nested, "agent-abc.jsonl"), edit("b", "src/two.ts") + done("b"));

  const logs = await listLogs(root);
  assert.equal(logs.length, 2);

  const store = await Store.open(await tmp());
  const all = await indexAll(store, { root });
  assert.deepEqual([all.files, all.changes, all.done], [2, 2, true]);
  assert.deepEqual(store.changes.map((c) => c.file).sort(), ["src/one.ts", "src/two.ts"]);
  assert.equal(store.lastIndexedAt !== null, true);
});

test("a subagent's edits count as unattended when its session did not ask", async () => {
  const root = await tmp();
  const project = join(root, "-Users-x-forge");
  const session = "22222222-2222-4222-8222-222222222222";
  const subagent = join(project, session, "subagents", "agent-xyz.jsonl");
  await mkdir(subagent.replace(/\/[^/]+$/, ""), { recursive: true });

  // Subagent logs never carry the decision for a call; the main log carries the mode.
  await writeFile(subagent, edit("a", "src/one.ts") + done("a"));
  await writeFile(join(project, `${session}.jsonl`), line({ type: "permission-mode", permissionMode: "auto", sessionId: session }));

  const store = await Store.open(await tmp());
  await indexAll(store, { root });
  assert.equal(store.changes.length, 1);
  assert.equal(store.changes[0].approvedBy, "auto");

  // A session that asks stays unknown: the log does not say who answered.
  await writeFile(join(project, `${session}.jsonl`), line({ type: "permission-mode", permissionMode: "default", sessionId: session }));
  await appendFile(subagent, edit("b", "src/two.ts") + done("b"));
  await indexAll(store, { root });
  assert.equal(store.changes[1].approvedBy, "unknown");
});

test("a budget that runs out leaves the rest for next time", async () => {
  const root = await tmp();
  for (let i = 0; i < 6; i++) await writeFile(join(root, `${i}.jsonl`), edit(`t${i}`, `src/f${i}.ts`) + done(`t${i}`));
  const store = await Store.open(await tmp());
  const first = await indexAll(store, { root, budgetMs: -1 });
  assert.equal(first.done, false);
  assert.equal(first.files, 0);
  const second = await indexAll(store, { root });
  assert.deepEqual([second.files, second.changes, second.done], [6, 6, true]);
});

test("a pulse is noted without the lock and read back after a reopen", async () => {
  const dir = await tmp();
  const store = await Store.open(dir);
  assert.deepEqual(await store.pulses(), { mcpStarted: null, mcpCalled: null, sessionStart: null });
  assert.equal(store.logCount, 0);
  await store.touch("mcpCalled", "2026-11-25T12:00:00.000Z");
  await store.touch("sessionStart", "2026-11-25T12:05:00.000Z");
  const reopened = await Store.open(dir);
  assert.deepEqual(await reopened.pulses(), { mcpStarted: null, mcpCalled: "2026-11-25T12:00:00.000Z", sessionStart: "2026-11-25T12:05:00.000Z" });
  // Nobody else's files are left behind in the folder.
  const { readdir } = await import("node:fs/promises");
  assert.deepEqual((await readdir(dir)).filter((f) => f.startsWith("pulse-")).sort(), ["pulse-mcpCalled", "pulse-sessionStart"]);
  // A store with no folder keeps its pulses in memory, so a hook can still be tested.
  const blank = Store.blank();
  await blank.touch("mcpStarted", "2026-11-25T12:00:00.000Z");
  assert.equal((await blank.pulses()).mcpStarted, "2026-11-25T12:00:00.000Z");
});

test("three readers that start together write each change once", async () => {
  const dir = await tmp();
  const root = await tmp();
  for (let i = 0; i < 5; i++) await writeFile(join(root, `${i}.jsonl`), edit(`t${i}`, `src/f${i}.ts`) + done(`t${i}`));
  // The hook at a first session, the background read it starts, and the MCP
  // server: three stores on one folder, none knowing of the others.
  const readers = await Promise.all([Store.open(dir), Store.open(dir), Store.open(dir)]);
  await Promise.all(readers.map((reader) => indexAll(reader, { root })));
  const rows = (await readFile(join(dir, "changes.ndjson"), "utf8")).trim().split("\n");
  assert.equal(rows.length, 5, "a line is never there twice");
  assert.equal((await Store.open(dir)).changes.length, 5);
  for (const reader of readers) assert.equal(reader.changes.length, 5, "and every reader ends up knowing all of them");
});

test("a process that lives long takes what another wrote, and answers with it", async () => {
  const dir = await tmp();
  const server = await Store.open(dir);
  const hook = await Store.open(dir);
  await hook.record([change("from-hook")], {});
  assert.deepEqual(server.changes.map((c) => c.id), [], "it has not looked yet");
  await server.sync();
  assert.deepEqual(server.changes.map((c) => c.id), ["from-hook"]);

  // The other way round, with the very change the other one already wrote.
  await server.record([change("from-hook")], {});
  await hook.sync();
  assert.deepEqual(hook.changes.map((c) => c.id), ["from-hook"]);
  assert.equal((await readFile(join(dir, "changes.ndjson"), "utf8")).trim().split("\n").length, 1);
});

test("a store that already holds a line twice is written out once", async () => {
  const dir = await tmp();
  const twice = [change("a"), change("a"), change("b")].map((c) => `${JSON.stringify(c)}\n`).join("");
  await appendFile(join(dir, "changes.ndjson"), twice);
  const store = await Store.open(dir);
  assert.deepEqual(store.changes.map((c) => c.id), ["a", "b"]);
  assert.equal((await readFile(join(dir, "changes.ndjson"), "utf8")).trim().split("\n").length, 2);
});

const padded = (id: string, file: string) =>
  line({
    type: "assistant", sessionId: "s", cwd: "/p", timestamp: "2026-11-25T10:00:00.000Z", padding: "x".repeat(900),
    message: { role: "assistant", content: [{ type: "tool_use", id, name: "Edit", input: { file_path: `/p/${file}`, old_string: "a", new_string: "b" } }] },
  });

test("a log longer than one read takes more than one pass, and is not called done before", async () => {
  const root = await tmp();
  const path = join(root, "long.jsonl");
  await writeFile(path, ["a", "b", "c"].map((id) => padded(id, `src/${id}.ts`) + done(id)).join(""));
  const store = await Store.open(await tmp());
  const first = await indexAll(store, { root, maxBytes: 1500 });
  assert.equal(first.done, false, "there is more of the file to read");
  assert.equal(store.indexComplete, false);
  const second = await indexAll(store, { root, maxBytes: 1500 });
  assert.equal(second.done, false);
  const third = await indexAll(store, { root, maxBytes: 1500 });
  assert.deepEqual([third.done, store.indexComplete, store.changes.length], [true, true, 3]);
});

test("a pass that must answer quickly leaves a long log to a background pass", async () => {
  const root = await tmp();
  await writeFile(join(root, "small.jsonl"), edit("a", "src/one.ts") + done("a"));
  await writeFile(join(root, "long.jsonl"), edit("b", "src/two.ts") + done("b") + line({ type: "user", padding: "x".repeat(9 * 1024 * 1024) }));
  const store = await Store.open(await tmp());
  const quick = await indexAll(store, { root, budgetMs: 10_000 });
  assert.deepEqual([quick.files, quick.changes, quick.done], [1, 1, false], "the small one now, the long one later");
  const full = await indexAll(store, { root });
  assert.deepEqual([full.changes, full.done, store.indexComplete], [1, true, true]);
  assert.deepEqual(store.changes.map((c) => c.file).sort(), ["src/one.ts", "src/two.ts"]);
});

test("a long job is held by one process at a time, and a dead holder's flag is taken over", async () => {
  const dir = await tmp();
  const release = (await tryHold(dir, "reading"))!;
  assert.ok(release);
  assert.equal(await tryHold(dir, "reading"), null, "a second one steps aside");
  await release();
  const again = (await tryHold(dir, "reading"))!;
  assert.ok(again, "and once the first is gone the flag is free");
  await again();

  const flag = join(dir, "reading");
  // Long enough that a machine under load cannot pause for it between two
  // awaits: age is given to the flag below by hand, not by waiting.
  const stale = 20_000;
  const held = (await tryHold(dir, "reading", stale))!;
  assert.match((await readFile(flag, "utf8")).trim(), new RegExp(`^${process.pid}:`), "the flag names who holds it");
  assert.equal(await tryHold(dir, "reading", stale), null, "a fresh flag is respected");
  const old = new Date(Date.now() - 60_000);
  await utimes(flag, old, old);
  const taken = await tryHold(dir, "reading", stale);
  assert.ok(taken, "a flag older than its stale time belongs to nobody");
  // The old holder finishing late takes nothing away from the new one.
  await held();
  assert.equal(await tryHold(dir, "reading", stale), null, "the new holder is still protected");
  await taken!();
});
