#!/usr/bin/env node
/**
 * Packs the plugin: everything a person installs, in one folder.
 *
 *   plugin/
 *     .claude-plugin/plugin.json   what it is
 *     .mcp.json                    how Claude Code starts the MCP server
 *     hooks/hooks.json             the two hooks
 *     agents/, commands/           the examiner and the slash commands
 *     dist/server.mjs              one file, no dependencies
 *     desk/                        the built desk page and everything it loads
 *
 * The site is not in here: it is published on its own from out/.
 *
 * The desk page is built on its own, with the site's routes set aside for a
 * moment (out-desk/). Built with the site, it shares script files with the
 * pages that talk to the site's server, and would carry the chat, the footer
 * and the operator's words into every plugin, where nothing runs them.
 *
 * After copying, the folder is checked the way Claude Code would load it, so
 * a plugin that cannot start fails here and not on somebody else's machine.
 */

import { spawn, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const plugin = join(root, "plugin");

/** What the desk page needs from out-desk/, and where it goes under plugin/desk/. */
const PAGE = ["desk", "_next", "fonts", "brand", "icon.svg", "favicon.ico"];
/** The desk page, built alone. */
const OUT_DESK = join(root, "out-desk");
/** Words of the site's scripts that must never be inside a plugin. None is a sentence a dictionary may hold. */
const SITE_WORDS = ["dock-button", "dock-panel", "bar-close", "sitedot", "NEXT_PUBLIC_MOZG_SITE_API", "Send me the link", "The operator's panel"];

function step(title) {
  process.stdout.write(`\n▸ ${title}\n`);
}

/**
 * The files under a `_next` folder that a page loads: those its HTML names,
 * and those those name, until nothing new is named. A file that is named and
 * was not built is an error: the page would ask for it and get nothing.
 */
async function loadedByPage(htmlFile, nextDir) {
  const seen = new Set();
  const texts = [await readFile(htmlFile, "utf8")];
  while (texts.length) {
    for (const match of texts.pop().matchAll(/static\/[A-Za-z0-9_\-/]+?\.(?:js|css)/g)) {
      if (seen.has(match[0])) continue;
      seen.add(match[0]);
      const file = join(nextDir, match[0]);
      if (!(await stat(file).catch(() => null))) throw new Error(`the desk page loads ${match[0]}, and it was not built`);
      if (/\.js$/.test(match[0])) texts.push(await readFile(file, "utf8"));
    }
  }
  return [...seen].sort();
}

function run(command, args) {
  const out = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (out.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
}

async function filesUnder(dir) {
  if (!(await stat(dir).catch(() => null))) return [];
  const out = [];
  for (const name of await readdir(dir)) {
    const full = join(dir, name);
    if ((await stat(full)).isDirectory()) out.push(...(await filesUnder(full)));
    else out.push(full);
  }
  return out;
}

async function size(path) {
  const info = await stat(path).catch(() => null);
  if (!info) return 0;
  if (info.isFile()) return info.size;
  const names = await readdir(path);
  const sizes = await Promise.all(names.map((name) => size(join(path, name))));
  return sizes.reduce((a, b) => a + b, 0);
}

const kb = (bytes) => `${(bytes / 1024).toFixed(bytes > 1024 * 1024 ? 0 : 1)} KB`;

/** A fact that must hold, or the plugin is not worth handing to anybody. */
async function must(ok, what) {
  if (!ok) throw new Error(`not true: ${what}`);
  process.stdout.write(`  ok  ${what}\n`);
}

/**
 * Runs `build` with the site's route folders renamed out of the way. Next takes
 * no notice of a folder whose name starts with an underscore, so the desk is
 * built alone; they are put back whatever happens.
 */
async function withSiteSetAside(build) {
  const aside = [];
  try {
    for (const name of ["(site)", "(locale)", "(admin)"]) {
      const from = join(root, "src", "app", name);
      if (!(await stat(from).catch(() => null))) continue;
      const to = join(root, "src", "app", `_${name.slice(1, -1)}.set-aside`);
      await rename(from, to);
      aside.push([from, to]);
    }
    await build();
  } finally {
    for (const [from, to] of aside.reverse()) await rename(to, from);
  }
}

async function main() {
  step("build the server, the desk on its own, and the site");
  run("npm", ["run", "build:server"]);
  await rm(OUT_DESK, { recursive: true, force: true });
  await withSiteSetAside(async () => {
    run("npx", ["next", "build"]);
    await rename(join(root, "out"), OUT_DESK);
  });
  run("npm", ["run", "build"]);

  step("every finished language has its pages, and no other has any");
  run("npm", ["run", "i18n:check", "--", "--built", "out", "--quiet"]);

  step("read the version once");
  const source = await readFile(join(root, "src/core/version.ts"), "utf8");
  const version = /VERSION\s*=\s*"([^"]+)"/.exec(source)?.[1];
  if (!version) throw new Error("could not read VERSION from src/core/version.ts");
  process.stdout.write(`  ${version}\n`);

  step("clear what the last pack left");
  await rm(join(plugin, "dist"), { recursive: true, force: true });
  await rm(join(plugin, "desk"), { recursive: true, force: true });
  await mkdir(join(plugin, "dist"), { recursive: true });
  await mkdir(join(plugin, "desk"), { recursive: true });

  step("copy");
  await cp(join(root, "dist/server.mjs"), join(plugin, "dist/server.mjs"));
  for (const name of PAGE) {
    const from = join(OUT_DESK, name);
    if (!(await stat(from).catch(() => null))) continue;
    if (name !== "_next") {
      await cp(from, join(plugin, "desk", name), { recursive: true });
      process.stdout.write(`  out-desk/${name}\n`);
      continue;
    }
    // Only what the desk page loads, and what those load. A page built for the
    // browser is given a second copy of its data for the printer of the page,
    // and nobody opens that: it is not carried into everybody's plugin.
    const loaded = await loadedByPage(join(OUT_DESK, "desk", "index.html"), from);
    for (const rel of loaded) await cp(join(from, rel), join(plugin, "desk", "_next", rel));
    process.stdout.write(`  out-desk/_next: ${loaded.length} files, the ones the desk page loads\n`);
  }

  step("check it the way Claude Code loads it");
  const manifest = JSON.parse(await readFile(join(plugin, ".claude-plugin/plugin.json"), "utf8"));
  const marketplace = JSON.parse(await readFile(join(root, ".claude-plugin/marketplace.json"), "utf8"));
  const mcp = JSON.parse(await readFile(join(plugin, ".mcp.json"), "utf8"));
  const hooks = JSON.parse(await readFile(join(plugin, "hooks/hooks.json"), "utf8"));

  await must(manifest.name === marketplace.plugins[0].name, `the plugin is "${manifest.name}" in its manifest and in the marketplace`);
  await must(marketplace.plugins[0].source === "./plugin", "the marketplace points at ./plugin");
  await must(manifest.version === version, `plugin.json says ${manifest.version}, the server says ${version}`);
  await must(mcp.mcpServers?.mozg?.args?.join(" ") === "${CLAUDE_PLUGIN_ROOT}/dist/server.mjs mcp", ".mcp.json starts dist/server.mjs mcp from the plugin root");
  await must(mcp.mcpServers.mozg.command === "node", ".mcp.json runs it with node, and nothing else");

  for (const event of ["SessionStart", "PreToolUse", "Stop"]) {
    const hook = hooks.hooks?.[event]?.[0]?.hooks?.[0];
    await must(hook?.command === 'node "${CLAUDE_PLUGIN_ROOT}/dist/server.mjs" hook', `${event} runs the same file as a hook`);
    await must(hook.timeout >= 10, `${event} allows the hook ${hook.timeout} seconds`);
  }
  await must(hooks.hooks.PreToolUse?.[0]?.matcher === "Edit|Write|MultiEdit|NotebookEdit", "the gate is asked before every tool that changes a file");

  for (const file of ["dist/server.mjs", "desk/desk/index.html", "agents/mozg-examiner.md", "commands/explain.md", "commands/status.md", "commands/map.md", "commands/desk.md"]) {
    await must((await stat(join(plugin, file))).isFile(), `${file} is there`);
  }

  const packed = spawnSync(process.execPath, [join(plugin, "dist/server.mjs"), "--version"], { encoding: "utf8" });
  await must(packed.status === 0 && packed.stdout.trim() === version, "the packed server runs and says the same version");

  // Every file the desk's own HTML asks for has to be in the folder. Only
  // files: a link to another page (the landing) is not something to pack.
  const html = await readFile(join(plugin, "desk/desk/index.html"), "utf8");
  const isFile = (path) => path.startsWith("/_next/") || path.startsWith("/fonts/") || path.startsWith("/brand/") || /\.(css|ico|svg|woff2?|png|webp)$/.test(path);
  const wanted = [...new Set([...html.matchAll(/(?:src|href)="(\/[^"#?]*)/g)].map((m) => m[1]))].filter(isFile);
  for (const path of wanted) {
    await must((await stat(join(plugin, "desk", path.slice(1))).catch(() => null))?.isFile(), `${path} is packed`);
  }

  // Not one word of the site is in the plugin: its chat, its footer, the
  // operator's panel. Nothing of it would run on the desk; it should not be
  // there to begin with.
  const packedScripts = (await filesUnder(join(plugin, "desk", "_next"))).filter((file) => /\.js$/.test(file));
  const words = await Promise.all(packedScripts.map((file) => readFile(file, "utf8")));
  for (const word of SITE_WORDS) {
    await must(!words.some((text) => text.includes(word)), `no script of the desk carries "${word}"`);
  }

  step("read one made-up log, and put one made-up edit to the person");
  // On a throwaway store, with a log written here and nowhere near a real one:
  // the check must read nobody's files and leave nothing behind in ~/.mozg.
  const scratch = await mkdtemp(join(tmpdir(), "mozg-pack-check-"));
  const trial = { ...process.env, MOZG_HOME: join(scratch, "trial"), MOZG_CLAUDE_PROJECTS: join(scratch, "logs") };
  const madeUp = join(trial.MOZG_CLAUDE_PROJECTS, "-Users-ada-forge");
  const at = "2026-01-01T10:00:00.000Z";
  const line = (value) => `${JSON.stringify(value)}\n`;
  await mkdir(madeUp, { recursive: true });
  await writeFile(
    join(madeUp, "11111111-1111-4111-8111-111111111111.jsonl"),
    line({
      type: "assistant", sessionId: "s-old", cwd: "/Users/ada/forge", timestamp: at,
      message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Edit", input: { file_path: "/Users/ada/forge/src/payments/charge.ts", old_string: "a", new_string: "b" } }] },
    }) +
      line({
        type: "user", timestamp: at,
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] },
        permissionDecision: { decision: "accept", source: "config" },
      }),
  );
  const door = (args, input) => spawnSync(process.execPath, [join(plugin, "dist/server.mjs"), ...args], { env: trial, input: input ?? "", encoding: "utf8", timeout: 30_000 });
  /** What the gate says before an edit, with nothing else of the hook input. */
  const before = (extra) => door(["hook"], JSON.stringify({ session_id: "s-new", hook_event_name: "PreToolUse", tool_name: "Edit", cwd: "/Users/ada/forge", tool_input: { file_path: "/Users/ada/forge/src/payments/charge.ts" }, ...extra }));

  const read = door(["index"]);
  await must(read.status === 0 && /read 1 log: 1 new change, 1 in total/.test(read.stderr), "the index door reads a log and counts its change");
  await must(/0 new changes?, 1 in total/.test(door(["index"]).stderr), "and reads nothing twice");
  const asked = JSON.parse(before({ permission_mode: "default" }).stdout);
  await must(asked.hookSpecificOutput?.permissionDecision === "ask" && /src\/payments is not explained yet/.test(asked.hookSpecificOutput.permissionDecisionReason), "an edit in a module nobody explained is put to the person");
  await must(before({ permission_mode: "default" }).stdout === "", "and once per module per session: the next edit goes through");
  await must(before({ permission_mode: "bypassPermissions" }).stdout === "", "where nobody can be asked, nothing is asked");
  await must(door(["hook"], JSON.stringify({ session_id: "s-x", hook_event_name: "PreToolUse", tool_name: "Bash", cwd: "/Users/ada/forge", tool_input: { command: "ls" } })).stdout === "", "and a tool that changes no file is not mozg's business");

  step("start the packed plugin once, the way a session does");
  const deskProcess = spawn(process.execPath, [join(plugin, "dist/server.mjs"), "desk", "--port", "0"], {
    env: { ...process.env, MOZG_HOME: join(scratch, "home"), MOZG_CLAUDE_PROJECTS: join(scratch, "nologs") },
    stdio: ["ignore", "ignore", "pipe"],
  });
  try {
    const address = await new Promise((done, fail) => {
      let said = "";
      const timer = setTimeout(() => fail(new Error("the packed desk did not start in 20 seconds")), 20_000);
      deskProcess.stderr.on("data", (chunk) => {
        said += chunk.toString();
        const found = /the desk is at (http:\/\/127\.0\.0\.1:\d+)\//.exec(said);
        if (found) {
          clearTimeout(timer);
          done(found[1]);
        }
      });
      deskProcess.on("exit", (code) => {
        clearTimeout(timer);
        fail(new Error(`the packed desk exited (${code}): ${said.trim()}`));
      });
    });
    const base = address;
    const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json());
    await must(health.ok === true && health.version === version && health.pid === deskProcess.pid, `its desk answers on ${base} with version ${version}`);
    const page = await fetch(`${base}/desk/`, { signal: AbortSignal.timeout(5000) }).then(async (r) => ({ status: r.status, html: await r.text() }));
    await must(page.status === 200 && /<html/.test(page.html), "it serves the desk page from its own folder");
    const state = await fetch(`${base}/api/state`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json());
    await must(state.connection?.plugin?.name === manifest.name, `the desk knows it is "${manifest.name}"`);
    await must(state.project === null, "on an empty store it says nothing has been seen, and invents nothing");
  } finally {
    deskProcess.kill();
    await rm(scratch, { recursive: true, force: true });
  }

  step("what it weighs");
  process.stdout.write(`  server   ${kb(await size(join(plugin, "dist")))}\n`);
  process.stdout.write(`  desk     ${kb(await size(join(plugin, "desk")))}\n`);
  process.stdout.write(`  plugin   ${kb(await size(plugin))} in all\n`);
  process.stdout.write(`\n${plugin}\n`);
}

main().catch((err) => {
  process.stderr.write(`\npack failed: ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
