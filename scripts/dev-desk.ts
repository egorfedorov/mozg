/**
 * A desk to build the page against, on a throwaway store.
 *
 * It is the sample session written the way the real plugin writes it, in the
 * folder mozg uses, with the pulses a live session leaves behind. So the page
 * can be developed against a desk that behaves like a real one, and neither
 * ~/.mozg nor a single session log of anybody's is touched.
 *
 *   npm run dev:api            the packed plugin, after npm run pack:
 *                              open http://127.0.0.1:4317/desk/
 *   npm run dev:api:plain      the plain build, with the page on the Next dev server
 */

import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sampleStore } from "../src/core/sample";
import { Store } from "../src/core/store";

const root = await mkdtemp(join(tmpdir(), "mozg-dev-"));
const storeDir = join(root, "store");
/** Empty on purpose: there is nothing real here to read. */
const logsDir = join(root, "logs");
await mkdir(logsDir);

const { changes, explains } = sampleStore();
const store = await Store.open(storeDir);
const logs = ["a", "b", "c", "d", "e", "f"].map((name) => join(logsDir, "-Users-ada-forge", `${name}.jsonl`));
await store.record(
  changes,
  Object.fromEntries(logs.map((path) => [path, { size: 1, mtime: 1, offset: 1 }])),
);
for (const explain of explains) await store.addExplain(explain);

// What a session leaves behind: attached 46 minutes ago, last called 3 ago.
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
await store.touch("mcpStarted", ago(46));
await store.touch("mcpCalled", ago(3));
await store.touch("sessionStart", ago(47));
await store.setIndexedAt(ago(1), true);

/**
 * Which server file to run: `plugin/dist/server.mjs` is the packed plugin,
 * page and all, exactly as a person gets it. The default is the plain build,
 * which has no page and expects the Next dev server at /desk/.
 */
const server = process.argv[2] ?? "dist/server.mjs";
const port = process.argv[3] ?? "4317";
process.stderr.write(`[mozg-dev] a throwaway store in ${root} · running ${server}\n`);
const child = spawn(process.execPath, [server, "desk", "--port", port], {
  stdio: "inherit",
  env: { ...process.env, MOZG_HOME: storeDir, MOZG_CLAUDE_PROJECTS: logsDir },
});
child.on("exit", (code) => void (process.exitCode = code ?? 0));
