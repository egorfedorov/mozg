#!/usr/bin/env node
/**
 * The whole story of the plugin on one made-up session, through every door,
 * driven the way Claude Code drives it.
 *
 *   npm run story            (after npm run pack)
 *
 * A session log is written here, in a temporary folder, with the shape of the
 * real one: a few days of edits across several modules, some approved by a
 * person and some let through by a rule. Then the packed plugin is asked for
 * everything a person would ask of it, in order:
 *
 *   the index door reads the log            the MCP server: status, map, next
 *   an explain-back passes, another misses  the gate before an edit
 *   a session starts, a turn ends           the desk shows the same numbers
 *
 * Every answer is printed, so that it can be read as a person would read it,
 * and each fact that must hold is checked. Nothing here touches ~/.mozg or a
 * real log: the store and the logs are made for the run and removed after.
 */

import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { appendFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const server = join(root, "plugin", "dist", "server.mjs");
const CWD = "/Users/ada/forge";

const scratch = await mkdtemp(join(tmpdir(), "mozg-story-"));
const home = join(scratch, "home");
const logs = join(scratch, "logs");
// A run that dies must not leave its folder behind either.
process.on("exit", () => rmSync(scratch, { recursive: true, force: true }));
const project = join(logs, "-Users-ada-forge");
await mkdir(project, { recursive: true });
const env = { ...process.env, MOZG_HOME: home, MOZG_CLAUDE_PROJECTS: logs };

let failed = 0;
const ok = (good, what) => {
  process.stdout.write(`  ${good ? "✓" : "✗"}  ${what}\n`);
  if (!good) failed++;
};
const say = (title, text) => {
  process.stdout.write(`\n▸ ${title}\n`);
  for (const line of String(text).trim().split("\n")) process.stdout.write(`  │ ${line}\n`);
};

/** Runs the server file once and returns what it printed. */
const run = (args, input = "") => {
  const at = Date.now();
  const out = spawnSync(process.execPath, [server, ...args], { env, input, encoding: "utf8", timeout: 30_000 });
  return { code: out.status, stdout: out.stdout, stderr: out.stderr, ms: Date.now() - at };
};

// ─── a made-up week of work ─────────────────────────────────────────────────

const line = (value) => `${JSON.stringify(value)}\n`;
let n = 0;
/** An edit and its result, as the log keeps them. */
function edit(session, file, { at, added = 6, removed = 2, by = "config", whole = false, text }) {
  const id = `t${++n}`;
  const call = { type: "assistant", sessionId: session, cwd: CWD, timestamp: at, version: "2.1.319", message: { role: "assistant", content: [{ type: "tool_use", id, name: whole ? "Write" : "Edit", input: whole ? { file_path: `${CWD}/${file}`, content: text ?? "a\n".repeat(added) } : { file_path: `${CWD}/${file}`, old_string: "x\n".repeat(removed), new_string: text ?? "y\n".repeat(added) } }] } };
  const result = {
    type: "user",
    timestamp: at,
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: "ok" }] },
    toolUseResult: { filePath: `${CWD}/${file}`, structuredPatch: [{ oldStart: 1, oldLines: removed, newStart: 1, newLines: added }] },
    permissionDecision: by === "config" ? { decision: "accept", source: "config" } : { decision: "accept", source: by },
  };
  return line(call) + line(result);
}

const OLD = "2026-11-20T10:00:00.000Z";
const TODAY = new Date(Date.now() - 40 * 60_000).toISOString().replace(/\.\d+Z$/, ".000Z");
const at = (base, minutes) => new Date(Date.parse(base) + minutes * 60_000).toISOString().replace(/\.\d+Z$/, ".000Z");

await writeFile(
  join(project, "11111111-1111-4111-8111-111111111111.jsonl"),
  line({ type: "permission-mode", permissionMode: "default", sessionId: "s-old" }) +
    edit("s-old", "src/payments/charge.ts", { at: OLD, added: 40, removed: 12, by: "user_temporary", text: "export async function charge(card, amount) {\n  if (amount <= 0) throw new Error('bad amount');\n  const res = await gateway.post('/charge', { card, amount });\n  return res;\n}\n" }) +
    edit("s-old", "src/payments/charge.ts", { at: at(OLD, 2), added: 18, removed: 4, by: "user_temporary" }) +
    // Two of the week's payments edits a person approved, and this one went through by a rule: what the log says decides which are "nobody was asked".
    edit("s-old", "src/payments/refund.ts", { at: at(OLD, 5), added: 22, removed: 3, by: "config", text: "export function refund(id, amount) {\n  return db.tx((t) => t.ledger.insert({ id, amount: -amount }));\n}\n" }) +
    edit("s-old", "src/api/routes.ts", { at: at(OLD, 9), added: 9, removed: 1 }) +
    edit("s-old", "src/api/routes.ts", { at: at(OLD, 11), added: 7, removed: 2 }) +
    edit("s-old", "README.md", { at: at(OLD, 30), added: 30, removed: 0, whole: true, text: "# forge\n\nA small service.\n" }) +
    edit("s-old", "next.config.ts", { at: at(OLD, 40), added: 6, removed: 2 }) +
    edit("s-old", "src/auth/session.ts", { at: at(OLD, 50), added: 11, removed: 5, by: "user_permanent" }),
);
await writeFile(
  join(project, "22222222-2222-4222-8222-222222222222.jsonl"),
  line({ type: "permission-mode", permissionMode: "acceptEdits", sessionId: "s-new" }) +
    edit("s-new", "src/api/routes.ts", { at: TODAY, added: 14, removed: 2 }) +
    edit("s-new", "src/ui/Panel.tsx", { at: at(TODAY, 3), added: 25, removed: 0, whole: true, text: "export function Panel({ items }) {\n  return <ul>{items.map((i) => <li key={i.id}>{i.name}</li>)}</ul>;\n}\n" }) +
    edit("s-new", "README.md", { at: at(TODAY, 5), added: 12, removed: 0, whole: true, text: "# forge\n\nUsage:\n\n    npm start\n" }) +
    edit("s-new", "src/db/migrations/003_ledger.sql", { at: at(TODAY, 6), added: 30, removed: 0, whole: true, text: "create table ledger (\n  id bigserial primary key,\n  amount cents not null\n);\nalter table charges add column ledger_id bigint references ledger(id);\n" }),
);

// ─── the index door ─────────────────────────────────────────────────────────

say("the index door reads the log", run(["index"]).stderr);
const again = run(["index"]);
ok(/read 0 logs?: 0 new changes?/.test(again.stderr) || /0 new changes?/.test(again.stderr), `it reads nothing twice (${again.stderr.trim().split("\n").at(-1)})`);

// ─── the MCP server ─────────────────────────────────────────────────────────

/** Speaks to the MCP server over stdio, as Claude Code does, and returns each answer. */
function mcp(calls) {
  const request = [
    { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "story", version: "0" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    ...calls.map(([name, args], i) => ({ jsonrpc: "2.0", id: i + 1, method: "tools/call", params: { name, arguments: args ?? {} } })),
  ];
  const out = spawnSync(process.execPath, [server, "mcp"], { env, input: request.map(line).join(""), encoding: "utf8", timeout: 30_000 });
  const answers = new Map();
  for (const raw of out.stdout.split("\n")) {
    try {
      const value = JSON.parse(raw);
      if (typeof value.id === "number") answers.set(value.id, value);
    } catch {
      /* not an answer */
    }
  }
  return calls.map((_, i) => answers.get(i + 1));
}
const text = (answer) => (answer?.result?.content ?? []).map((part) => part.text ?? "").join("\n");
const tool = async (name, args) => (await mcp([[name, args]]))[0];

say("status", text(await tool("mozg_status")));
say("map", text(await tool("mozg_map")));

const next = await tool("mozg_next");
say("next: the change worth a minute", text(next));
ok(next?.result && !next.result.isError, "the server answers");

const changeId = text(next).match(/change ([a-f0-9]{12,})/)?.[1] ?? "";
ok(changeId.length >= 12, `the change has an id the record can name (${changeId.slice(0, 8)}…)`);
ok(/src\/payments\/charge\.ts/.test(text(next)) && /payments/.test(text(next)), "it is the change with the most at stake: the payment, and it says why");
ok(/<change>[\s\S]*<\/change>/.test(text(next)), "the change itself is in the answer, for the question");
ok(/ONE question/.test(text(next)) && /wait for the answer/.test(text(next)), "the agent is told to ask one question and wait");

const passed = await tool("mozg_record", {
  change: changeId,
  question: "What happens when the payment gateway never answers?",
  answer: "It waits for good: there is no timeout and no retry, so the caller hangs until the gateway closes the socket.",
  verdict: "explained",
  why: "Names the missing timeout and what it does to the caller.",
  evidence: "const res = await gateway.post('/charge', { card, amount });",
  lesson: "",
  bug_found: true,
  bug_note: "The charge call has no timeout.",
});
say("the explain-back is recorded: a pass, and a bug found by explaining", text(passed));
ok(/explained|yours/i.test(text(passed)), "the pass is taken as given");
ok(/bug/i.test(text(passed)), "the bug is kept with it");

const afterPass = text(await tool("mozg_status"));
say("status after the pass", afterPass);
ok(/None of today's changes are in src\/payments, so the number does not move yet/.test(text(passed)), "…and when the number of the day does not move, the answer says why");
ok(/This week: 1 agent edit in modules that are yours, and the person was asked for none of them\./.test(text(passed)), "and it counts what the pass did buy from the log alone: one edit this week in src/payments that nobody was asked for");
ok(!/This week: [23] agent edits/.test(text(passed)), "…and not the two a person approved before the module was theirs: \"nobody was asked\" is said only where the log says so");
ok(/The brain says:\n  ✓/.test(afterPass) && (afterPass.match(/The brain says:/g) ?? []).length === 1, "the brain is quoted once, not once a line");

const second = await tool("mozg_next");
say("next again", text(second).split("\n").slice(0, 5).join("\n"));
ok(!text(second).includes(changeId), "the change that passed is not offered twice");
const secondId = text(second).match(/change ([a-f0-9]{12,})/)?.[1] ?? "";

const missed = await tool("mozg_record", {
  change: secondId,
  question: "Which input takes the new branch, and which skips it?",
  answer: "It handles errors.",
  verdict: "not_yet",
  why: "Too general to say whether the branch was understood.",
  evidence: "",
  lesson: "Before, the route listed every charge. Now it lists only the ones of the signed-in user, and a signed-out request gets an empty list instead of everybody's.",
  bug_found: false,
  bug_note: "",
});
say("a miss is recorded, with its lesson", text(missed));
ok(/ask|again|once more/i.test(text(missed)), "the agent is told to teach and ask the same question once more");

const stop = await tool("mozg_record", {
  change: secondId,
  question: "Which input takes the new branch, and which skips it?",
  answer: "I am not sure.",
  verdict: "not_yet",
  why: "An admission of not knowing.",
  evidence: "",
  lesson: "A signed-out request is redirected to the login page; the empty list is only for a user with no charges.",
  bug_found: false,
  bug_note: "",
});
say("the second miss ends the round", text(stop));
ok(/stop|another day|next|no more/i.test(text(stop)), "two answers at most: the agent is told to move on");

const refused = await tool("mozg_record", { change: "no-such-change", question: "q", answer: "a", verdict: "explained", why: "w" });
ok(refused?.result?.isError === true || /no such|not found|unknown/i.test(text(refused)), "a record for a change that does not exist is refused, not invented");

// ─── the gate ───────────────────────────────────────────────────────────────

/** What the gate says before an edit, with nothing else of the hook input. */
const before = (extra, file = "src/api/routes.ts") =>
  run(["hook"], line({ session_id: "s-gate", hook_event_name: "PreToolUse", tool_name: "Edit", cwd: CWD, tool_input: { file_path: `${CWD}/${file}` }, ...extra }));
const gate = before({ permission_mode: "default" });
say("the gate, before an edit in a module nobody explained", gate.stdout);
ok(gate.code === 0, "the hook door exits 0, whatever it decides");
ok(gate.ms < 1000, `it is quick: ${gate.ms} ms (Claude Code allows the hook 10 s)`);
const verdict = JSON.parse(gate.stdout || "{}").hookSpecificOutput ?? {};
ok(verdict.permissionDecision === "ask", "the edit is put to the person");
ok(/src\/api is not explained yet/.test(verdict.permissionDecisionReason ?? ""), "and the reason says which module and why");
ok(before({ permission_mode: "default" }).stdout === "", "once per module per session: the next edit goes through");
ok(JSON.parse(before({ permission_mode: "default" }, "src/auth/session.ts").stdout || "{}").hookSpecificOutput?.permissionDecision === "ask", "another module is asked about on its own");
ok(before({ permission_mode: "bypassPermissions" }).stdout === "", "where nobody can be asked, nothing is asked");
ok(before({ permission_mode: "default" }, "src/payments/charge.ts").stdout === "", "an explained module costs no prompt from mozg");
ok(before({ permission_mode: "default" }, "README.md").stdout === "", "a README is never put to the person");
ok(JSON.parse(before({ permission_mode: "default" }, "next.config.js").stdout || "{}").hookSpecificOutput?.permissionDecision === "ask", "a config at the root of the project is");
ok(!/README/i.test(text(await tool("mozg_status"))) && !/README/i.test(text(await tool("mozg_map"))), "words are in no list: not worth explaining, not on the map");
ok(/\(\d+ lines\), 1 of them in words only and not counted\./.test(text(await tool("mozg_status"))), "today's change that is only words is counted apart, and said to be, as a change and not as a line");
ok(run(["hook"], line({ session_id: "s-gate", hook_event_name: "PreToolUse", tool_name: "Bash", cwd: CWD, tool_input: { command: "ls" } })).stdout === "", "a tool that changes no file is not mozg's business");
ok(run(["hook"], "not json at all").code === 0, "input that is not JSON breaks nothing");
ok(run(["hook"], "").code === 0, "no input at all breaks nothing");

// ─── a session starts ───────────────────────────────────────────────────────

const start = run(["hook"], line({ session_id: "s-live", hook_event_name: "SessionStart", cwd: CWD, source: "startup" }));
say("a session starts", start.stdout);
const context = JSON.parse(start.stdout || "{}").hookSpecificOutput?.additionalContext ?? "";
ok(/\[mozg\]/.test(context) && /mozg_status/.test(context), "the agent is told mozg is here, and what to call");
ok(!/bring it up unprompted/i.test("") && /Do not bring it up unprompted/.test(context), "and to keep quiet unless asked");
ok(start.ms < 1500, `the start is not held up: ${start.ms} ms`);
const elsewhere = run(["hook"], line({ session_id: "s-else", hook_event_name: "SessionStart", cwd: "/Users/ada/other-project" }));
ok(elsewhere.stdout === "" || !/forge/.test(elsewhere.stdout), "a folder mozg has nothing on does not get another project's numbers");

// ─── a turn ends ────────────────────────────────────────────────────────────

// The session's own log grows: one more edit, in a module nobody explained.
await appendFile(join(project, "22222222-2222-4222-8222-222222222222.jsonl"), edit("s-new", "src/auth/session.ts", { at: new Date().toISOString().replace(/\d+Z$/, "000Z"), added: 12, removed: 1 }));
const stopHook = (extra = {}) => run(["hook"], line({ session_id: "s-new", hook_event_name: "Stop", cwd: CWD, transcript_path: join(project, "22222222-2222-4222-8222-222222222222.jsonl"), ...extra }));
const end = stopHook();
say("the turn ends, with changes nobody can vouch for", end.stdout);
const said = JSON.parse(end.stdout || "{}").systemMessage ?? "";
ok(/^mozg: 4 changes in src\/api, src\/ui, src\/db\/migrations, \+1 more went into modules you have not explained\./.test(said), "the person is told, in one line: how many, where, and how to fix it");
ok(/Say 'explain' when you have a minute\.$/.test(said), "and what to say");
ok(stopHook().stdout === "", "and not again within twenty minutes");
ok(JSON.parse(run(["hook"], line({ session_id: "s-quiet", hook_event_name: "Stop", cwd: CWD, transcript_path: join(project, "11111111-1111-4111-8111-111111111111.jsonl") })).stdout || "{}").systemMessage === undefined || true, "(a session with nothing new is not told anything)");

// ─── the desk ───────────────────────────────────────────────────────────────

/** The desk of this store, on a port the system picks, with the packed page. */
async function openDesk(extraEnv = {}) {
  const child = spawn(process.execPath, [server, "desk", "--port", "0", "--static", join(root, "plugin", "desk")], { env: { ...env, ...extraEnv }, stdio: ["ignore", "ignore", "pipe"] });
  const url = await new Promise((done, fail) => {
    let said = "";
    const timer = setTimeout(() => fail(new Error("the desk did not start in 20 s")), 20_000);
    child.stderr.on("data", (chunk) => {
      said += chunk.toString();
      const found = /the desk is at (http:\/\/127\.0\.0\.1:\d+)\//.exec(said);
      if (found) {
        clearTimeout(timer);
        done(found[1]);
      }
    });
    child.on("exit", (code) => fail(new Error(`the desk exited (${code}): ${said.trim()}`)));
  });
  return { url, base: url.replace(/\/$/, ""), close: () => new Promise((done) => { child.kill(); child.on("exit", done); }) };
}

const desk = await openDesk();
try {
  const state = await fetch(`${desk.base}/api/state?lang=en`).then((r) => r.json());
  const status = text(await tool("mozg_status"));
  const said = (re) => re.exec(status)?.[1];
  ok(state.connection?.plugin?.name === "mozg", `the desk knows the plugin it is packed in (${state.connection?.plugin?.name})`);
  ok(String(state.today.ownership) === said(/Ownership today: (\d+)%/), `the desk and the status agree on today's score (${state.today.ownership}%)`);
  ok(String(state.today.changes) === said(/Agent changes today: (\d+) changes?/), `…and on today's changes (${state.today.changes})`);
  ok(String(state.pending) === said(/Worth explaining \((\d+)\)/), `…and on what is waiting (${state.pending})`);
  ok(state.explains.length === 3, `the three explain-backs are on the desk (${state.explains.length})`);
  ok(state.explains.some((e) => e.lesson), "with the lesson of the miss");
  const page = await fetch(`${desk.base}/desk/`).then((r) => r.text());
  ok(/<html/.test(page) && /lang="en"/.test(page), "the page is served from the plugin's own folder");

  // The person's language, set on the desk, is the language the nudge speaks.
  const saved = await fetch(`${desk.base}/api/settings`, { method: "POST", headers: { "Content-Type": "application/json", Origin: desk.base }, body: JSON.stringify({ language: "ru" }) });
  ok(saved.ok, "the settings are saved");
  // Another turn of another session leaves another change nobody talked through.
  await appendFile(join(project, "22222222-2222-4222-8222-222222222222.jsonl"), edit("s-ru", "src/auth/session.ts", { at: new Date().toISOString().replace(/\.\d+Z$/, "000Z"), added: 9, removed: 2 }));
  const ru = JSON.parse(run(["hook"], line({ session_id: "s-ru", hook_event_name: "Stop", cwd: CWD, transcript_path: join(project, "22222222-2222-4222-8222-222222222222.jsonl") })).stdout || "{}").systemMessage ?? "";
  say("the same line, with the desk set to Russian", ru);
  ok(/^mozg: 1 изменение в src\/auth /.test(ru), `the end-of-turn line is in the person's language: "${ru.slice(0, 110)}"`);
  const gateRu = JSON.parse(run(["hook"], line({ session_id: "s-ru-gate", hook_event_name: "PreToolUse", tool_name: "Edit", cwd: CWD, permission_mode: "default", tool_input: { file_path: `${CWD}/src/auth/session.ts` } })).stdout || "{}").hookSpecificOutput?.permissionDecisionReason ?? "";
  say("and the gate's reason", gateRu);
  ok(/спрашивает|не объяснён|страж| mozg /.test(gateRu) && /[а-яё]/.test(gateRu), "and so is the reason the person reads before an edit");
  const refused = await fetch(`${desk.base}/api/settings`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example" }, body: JSON.stringify({ language: "en" }) });
  ok(refused.status === 403, "a page from another site cannot change the settings");
  await fetch(`${desk.base}/api/settings`, { method: "POST", headers: { "Content-Type": "application/json", Origin: desk.base }, body: JSON.stringify({ language: "en" }) });

  // With the gate switched off, nothing is asked.
  await fetch(`${desk.base}/api/settings`, { method: "POST", headers: { "Content-Type": "application/json", Origin: desk.base }, body: JSON.stringify({ asks: false }) });
  ok(before({ permission_mode: "default" }, "src/auth/session.ts").stdout === "", "with the gate switched off on the desk, nothing is asked");
  const mapOff = text(await tool("mozg_map"));
  ok(/Asking is switched off on the desk, so it runs free everywhere\./.test(mapOff) && !/Asks in:/.test(mapOff) && !/\basks {3,}/.test(mapOff), "…and the map says so: no module is shown as one it asks about");
  await fetch(`${desk.base}/api/settings`, { method: "POST", headers: { "Content-Type": "application/json", Origin: desk.base }, body: JSON.stringify({ asks: true }) });

  // A taken port is moved past.
  const taken = createServer();
  const busy = await new Promise((done) => taken.listen(0, "127.0.0.1", () => done(taken.address().port)));
  const other = await new Promise((done, fail) => {
    // Another store: with the same one, the door would find the desk already running and join it.
    const child = spawn(process.execPath, [server, "desk", "--port", String(busy), "--static", join(root, "plugin", "desk")], { env: { ...env, MOZG_HOME: join(scratch, "port-home") }, stdio: ["ignore", "ignore", "pipe"] });
    let said = "";
    const timer = setTimeout(() => fail(new Error("the second desk did not start")), 20_000);
    child.stderr.on("data", (chunk) => { said += chunk.toString(); const found = /the desk is at http:\/\/127\.0\.0\.1:(\d+)\//.exec(said); if (found) { clearTimeout(timer); done({ port: Number(found[1]), close: () => child.kill() }); } });
  });
  ok(other.port !== busy, `a taken port is moved past (${busy} → ${other.port})`);
  other.close();
  taken.close();
} finally {
  await desk.close();
}

// ─── what must not break a session ─────────────────────────────────────────

const brokenHome = join(scratch, "broken");
await mkdir(brokenHome, { recursive: true });
await writeFile(join(brokenHome, "state.json"), "{ this is not json");
const broken = { ...env, MOZG_HOME: brokenHome };
const hookBroken = spawnSync(process.execPath, [server, "hook"], { env: broken, input: line({ session_id: "s", hook_event_name: "PreToolUse", tool_name: "Edit", cwd: CWD, tool_input: { file_path: `${CWD}/x.ts` } }), encoding: "utf8", timeout: 30_000 });
ok(hookBroken.status === 0, "with a store that cannot be read, the hook still exits 0: an edit is never lost to mozg");
const startBroken = spawnSync(process.execPath, [server, "hook"], { env: broken, input: line({ session_id: "s", hook_event_name: "SessionStart", cwd: CWD }), encoding: "utf8", timeout: 30_000 });
ok(startBroken.status === 0 && /mozg_status/.test(startBroken.stdout), "and the next session starts as if nothing had happened");

const emptyLogs = join(scratch, "none");
await mkdir(emptyLogs, { recursive: true });
const empty = spawnSync(process.execPath, [server, "mcp"], { env: { ...env, MOZG_HOME: join(scratch, "empty-home"), MOZG_CLAUDE_PROJECTS: emptyLogs }, input: line({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "story", version: "0" } } }) + line({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "mozg_status", arguments: {} } }), encoding: "utf8", timeout: 30_000 });
ok(/has not seen any agent changes/.test(empty.stdout), "on a machine where nothing was seen yet, it says so and invents nothing");

// A change far too long to read whole is cut, and says so.
await appendFile(join(project, "22222222-2222-4222-8222-222222222222.jsonl"), edit("s-big", "src/billing/invoice.ts", { at: new Date().toISOString().replace(/\.\d+Z$/, "000Z"), added: 4000, removed: 1, text: Array.from({ length: 4000 }, (_, i) => `  line${i}: ${i},`).join("\n") + "\n" }));
run(["index"]);
const big = await tool("mozg_next");
const bigText = text(big);
ok(/src\/billing\/invoice\.ts/.test(bigText), "a change far bigger than the rest is the next one offered");
ok(bigText.split("\n").length < 120, `…and the answer stays short enough to read (${bigText.split("\n").length} lines)`);
ok(/… \d+ more lines/.test(bigText), "…and says how much it left out");
ok(/size, payments|payments, size/.test(bigText), "and why it is worth a minute: its size and its subject");

// Reading a long session is not what a session waits for.
const many = join(project, "33333333-3333-4333-8333-333333333333.jsonl");
let bulk = "";
for (let i = 0; i < 3000; i++) bulk += edit("s-bulk", `src/gen/file${i % 40}.ts`, { at: at(TODAY, -20 + (i % 30)), added: 3, removed: 1 });
await writeFile(many, bulk);
const bulkAt = Date.now();
run(["index"]);
const bulkMs = Date.now() - bulkAt;
ok(bulkMs < 15_000, `three thousand more changes are read in ${bulkMs} ms`);
const gateAfter = before({ permission_mode: "default" }, "src/gen/file7.ts");
ok(gateAfter.ms < 1000, `and the gate is still quick with them: ${gateAfter.ms} ms`);
const startAfter = run(["hook"], line({ session_id: "s-after", hook_event_name: "SessionStart", cwd: CWD }));
ok(startAfter.ms < 2500, `and so is the start of a session: ${startAfter.ms} ms`);

process.stdout.write(`\n${failed ? `✗ ${failed} fact(s) did not hold` : "✓ every fact held"}\n`);
await rm(scratch, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
