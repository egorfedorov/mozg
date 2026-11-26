/**
 * One file, four doors. Claude Code starts it, and the first word says which:
 *
 *   mcp    the MCP server on stdio, one per session
 *   hook   a SessionStart, Stop or PreToolUse hook: JSON in on stdin, JSON out on stdout
 *   desk   the local desk on 127.0.0.1, one per machine
 *   index  read every session log, then exit
 *
 * Nothing on stdout except protocol: a hook or an MCP client reads it, and a
 * stray log line there is a parse error on the other side. Diagnostics go to
 * stderr. The hook door always exits 0.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { onBeforeEdit, onSessionStart, onStop, type HookDeps, type HookInput, type HookOutput } from "@/hooks/hooks";
import { indexAll } from "@/core/indexer";
import { tryHold } from "@/core/lock";
import { languageFor } from "@/core/settings";
import { setLanguage } from "@/lib/i18n";
// The words of every finished language, for what this file says to a person.
// Only the messages: the documentation never leaves the site.
import "@/i18n/messages";
import { mozgHome } from "@/core/paths";
import { Store } from "@/core/store";
import { VERSION } from "@/core/version";
import { deskAlive, deskRecord, ensureDesk, openInBrowser, startDesk } from "./desk";
import { INVALID_PARAMS, METHOD_NOT_FOUND, RpcError, serve, type Handler, type Params } from "./jsonrpc";
import { TOOLS, toolByName, type Ctx } from "./tools";

const log = (...parts: unknown[]) => console.error("[mozg]", ...parts);

/** The folder this file sits in; the packed desk page is beside it. */
function ownDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

const INSTRUCTIONS = [
  "mozg keeps track of what the user can vouch for in the code their agent writes.",
  "- When the user asks what they own, says 'status' or 'explain', or wraps up a session, call mozg_status.",
  "- 'explain' means: mozg_next; ask the user the one question it gives you; wait; hand the change, the question and the answer to the mozg-examiner subagent; mozg_record its verdict. On a miss, mozg_record tells you to teach once and ask the same question again: do exactly that, once, and never answer for the user.",
  "- Never answer the explain-back question for the user, and never bring mozg up unprompted.",
  "- Where a module is not explained, Claude Code asks the user before an edit there (mozg does that). If it is refused, do not work around it and do not retry: offer an explain-back with mozg_next, or move on.",
].join("\n");

export async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "mcp":
      await mcp();
      return 0;
    case "hook":
      // A hook must never break a session. Whatever goes wrong inside it, it
      // ends quietly: exit 2 would stop the session, and a visible failure
      // would make mozg a nuisance before it has been any use.
      try {
        await hook();
      } catch (err) {
        log("hook skipped:", err instanceof Error ? err.message : err);
      }
      return 0;
    case "desk":
      await desk(rest);
      return 0;
    case "index":
      return index();
    case "--version":
      process.stdout.write(`${VERSION}\n`);
      return 0;
    default:
      process.stderr.write(usage);
      return 1;
  }
}

const usage = `mozg ${VERSION}

  node server.mjs mcp             the MCP server on stdio (Claude Code starts it)
  node server.mjs hook            a SessionStart, Stop or before-edit hook (JSON on stdin)
  node server.mjs desk [--sample] [--port N] [--static DIR] [--open]
                                  the local desk on 127.0.0.1
  node server.mjs index           read every session log, then exit

Everything stays on this machine: ~/.mozg holds the store, and nothing is sent anywhere.
`;

// ─── mcp ────────────────────────────────────────────────────────────────────

async function mcp(): Promise<void> {
  // What this door says is for the agent, and the agent relays it to the
  // person in the person's own words. So it is always English, whatever
  // language the person has chosen for the desk and the gate.
  setLanguage("en");
  const store = await Store.open(mozgHome());
  const ctx: Ctx = {
    store,
    cwd: process.env.CLAUDE_PROJECT_DIR ?? process.env.PWD ?? null,
    desk: (open) => deskFromSession(open),
  };

  const handler: Handler = async (method: string, params: Params) => {
    switch (method) {
      case "initialize":
        // The moment Claude Code attached this server: the desk can then say
        // when the agent last connected rather than guess.
        void ctx.store.touch("mcpStarted", new Date().toISOString()).catch(() => {});
        return {
          protocolVersion: "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "mozg", version: VERSION },
          instructions: INSTRUCTIONS,
        };
      case "ping":
        return {};
      case "tools/list":
        return { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) };
      case "tools/call": {
        const name = typeof params.name === "string" ? params.name : "";
        const tool = toolByName(name);
        if (!tool) {
          throw new RpcError(INVALID_PARAMS, `Unknown tool: ${name}. Call tools/list for what is available.`);
        }
        // This server lives as long as the session, and the hook at the end
        // of every turn writes to the store. Take what it wrote before answering.
        await ctx.store.sync().catch(() => {});
        const args = params.arguments;
        const out = await tool.run(
          args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : {},
          ctx,
        );
        // A note that the agent is talking to mozg, and never a reason to fail.
        void ctx.store.touch("mcpCalled", new Date().toISOString()).catch(() => {});
        return { content: [{ type: "text", text: out.text }], isError: out.isError ?? false };
      }
      default:
        throw new RpcError(METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
  };

  // The first session on a machine has no past yet, and a long one is read in
  // more than one pass. Reading it takes a while, so it happens elsewhere and
  // this session carries on.
  if (!store.lastIndexedAt || !store.indexComplete) startBackgroundIndex(store);

  await serve(process.stdin, process.stdout, handler);
}

function startBackgroundIndex(store: Store): void {
  const script = process.argv[1];
  if (!script || !/\.[cm]?js$/.test(script)) {
    // Not a built file (a test, or running from source): do it here instead.
    void indexAll(store).catch(() => {});
    return;
  }
  try {
    const child = spawn(process.execPath, [script, "index"], { detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.on("spawn", () => child.unref());
  } catch {
    // No background reader: the next mozg_status reads what it can in its budget.
  }
}

/**
 * The desk outlives the session that asked for it, so it is its own process.
 * Started from source (tests, development) there is no script to spawn and it
 * runs inside this one instead.
 */
async function deskFromSession(open: boolean): Promise<string> {
  let running = await runningDesk();
  if (running) {
    if (open) openInBrowser(running);
    return running;
  }
  const script = process.argv[1];
  if (script && /\.[cm]?js$/.test(script)) {
    const child = spawn(process.execPath, [script, "desk"], { detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.on("spawn", () => child.unref());
    // It only has to bind a port; if it has not in this time it will not.
    for (let i = 0; i < 40 && !running; i++) {
      await new Promise((r) => setTimeout(r, 150));
      running = await runningDesk();
    }
    if (running) {
      if (open) openInBrowser(running);
      return running;
    }
  }
  const desk = await ensureDesk({ staticDir: packedDesk() });
  if (open) openInBrowser(desk.url);
  return desk.url;
}

async function runningDesk(): Promise<string | null> {
  const record = await readFile(deskRecord(), "utf8")
    .then((text) => JSON.parse(text) as { port?: number })
    .catch(() => null);
  return record?.port && (await deskAlive(record.port)) ? `http://127.0.0.1:${record.port}/desk/` : null;
}

function packedDesk(): string | null {
  // This file is plugin/dist/server.mjs; the page is packed beside dist, as
  // plugin/desk/, by scripts/pack.mjs: desk/index.html and its _next/ chunks.
  const dir = join(ownDir(), "..", "desk");
  return existsSync(join(dir, "desk", "index.html")) ? dir : null;
}

// ─── hook ──────────────────────────────────────────────────────────────────

async function hook(): Promise<void> {
  let input: HookInput = {};
  try {
    const raw = await readStdin();
    if (raw.trim()) input = JSON.parse(raw) as HookInput;
    if (!input || typeof input !== "object") return;
  } catch {
    return;
  }

  // Both hooks read the whole store. A module's state depends on everything
  // the agent did in it since it was explained, across sessions, and a hook
  // that saw only this turn would keep calling a rewritten module "explained".
  const deps: HookDeps = { store: await Store.open(mozgHome()), indexInBackground: () => startBackgroundIndexFromHook() };
  // The gate's reason and the nudge are read by the person: in their language.
  setLanguage(languageFor(deps.store.settings.language));
  const event = input.hook_event_name;
  // A session start is the hook proving it is wired in. It is a single small
  // file written without the lock, so the session is not kept waiting.
  if (event !== "Stop" && event !== "PreToolUse") void deps.store.touch("sessionStart", new Date().toISOString()).catch(() => {});

  const out: HookOutput | null =
    event === "Stop"
      ? await onStop(input, deps)
      : event === "PreToolUse"
        ? await onBeforeEdit(input, deps)
        : await onSessionStart(input, deps);
  if (out) process.stdout.write(`${JSON.stringify(out)}\n`);
}

function startBackgroundIndexFromHook(): void {
  const script = process.argv[1];
  if (!script || !/\.[cm]?js$/.test(script)) return;
  try {
    spawn(process.execPath, [script, "index"], { detached: true, stdio: "ignore" }).on("error", () => {});
  } catch {
    // The next session start tries again.
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

// ─── desk ──────────────────────────────────────────────────────────────────

async function desk(args: string[]): Promise<void> {
  let sample = false;
  let open = false;
  let port: number | undefined;
  /** A built page to serve instead of the packed one: for looking at a build. */
  let staticArg: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--sample") sample = true;
    else if (arg === "--open") open = true;
    else if (arg === "--port") port = Number(args[++i]);
    else if (arg.startsWith("--port=")) port = Number(arg.slice(7));
    else if (arg === "--static") staticArg = args[++i];
    else if (arg.startsWith("--static=")) staticArg = arg.slice(9);
  }
  // Packed beside this file, or named on the command line.
  const staticDir = (staticArg ? resolve(staticArg) : packedDesk()) ?? null;
  if (port !== undefined && !Number.isInteger(port)) {
    process.stderr.write("--port needs a number.\n");
    process.exitCode = 2;
    return;
  }

  const running = !sample && (await runningDesk());
  if (running) {
    log(`the desk is already running at ${running}`);
    if (open) openInBrowser(running);
    return;
  }

  // A sample desk is not written down: a later real one must not find it and
  // show a stranger's session.
  const desk = sample
    ? await startDesk({ sample: true, port, staticDir })
    : await ensureDesk({ port, staticDir });
  if (open) openInBrowser(desk.url);
  log(`the desk is at ${desk.url}${sample ? " (sample session)" : ""} · Ctrl-C to stop`);

  const stop = () => void desk.close().then(() => process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  await new Promise<void>(() => {});
}

// ─── index ─────────────────────────────────────────────────────────────────

async function index(): Promise<number> {
  const store = await Store.open(mozgHome());
  // One reader at a time. On a first session the hook starts this read and so
  // does the MCP server a moment later; the second would only read the same
  // bytes again, and the store would have to throw them out.
  const release = store.dir ? await tryHold(store.dir, "reading") : null;
  if (!release) {
    log("another read of the logs is already running; this one steps aside");
    return 0;
  }
  const started = Date.now();
  try {
    await store.sync();
    let files = 0;
    let changes = 0;
    let done = false;
    // A log longer than one read continues on the next pass, until all are read to the end.
    for (let pass = 0; pass < 40 && !done; pass++) {
      const one = await indexAll(store);
      files += one.files;
      changes += one.changes;
      done = one.done;
    }
    log(
      `read ${files} log${files === 1 ? "" : "s"}: ${changes} new change${changes === 1 ? "" : "s"}, ` +
        `${store.changes.length} in total${done ? "" : " (stopped early; the rest waits)"} · ${Date.now() - started} ms`,
    );
    return 0;
  } finally {
    await release();
  }
}

const running = main(process.argv.slice(2));
running.catch((err: unknown) => {
  log("failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
