/**
 * The local desk: a small HTTP server on 127.0.0.1.
 *
 * It answers whether it is up, the state of the person's ownership, the one
 * thing the person may change (the settings), and the static page that draws
 * it. Only the loopback interface, so nothing on the network can reach it; the
 * page is a static export that asks `/api/state` and renders it.
 *
 * The one door that writes is guarded three ways. The Host has to name this
 * machine, so a domain rebound onto 127.0.0.1 is refused. The Origin, when
 * there is one, has to be a local page. And the body has to be JSON, which a
 * page on another site cannot make a browser send here without asking first,
 * and is never allowed to.
 *
 * In development the page runs under `next dev` on another port and is
 * allowed to ask this server for its numbers; in the packed plugin the page
 * sits beside this file and is served from here.
 */

import { spawn } from "node:child_process";
import { createReadStream, readFileSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { homedir } from "node:os";
import { extname, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDeskState, projectName } from "@/core/desk";
import { DESK_PORT, claudeProjectsDir, mozgHome } from "@/core/paths";
import { languageFor } from "@/core/settings";
import { sampleDesk } from "@/core/sample";
import { mergeSettings } from "@/core/settings";
import { Store } from "@/core/store";
import type { Connection } from "@/core/types";
import { isLang, setLanguage } from "@/lib/i18n";
import { VERSION } from "@/core/version";

export interface DeskOptions {
  /** The first port to try; it moves up while the one before is taken. */
  port?: number;
  /** Serve the sample session instead of reading anybody's logs. */
  sample?: boolean;
  /** Where the packed page lives. Null in development, when Next serves it. */
  staticDir?: string | null;
  /** The mozg folder to read. */
  storeDir?: string;
  /** Where the session logs are; only named on the desk, never read here. */
  logsDir?: string;
}

export interface Desk {
  url: string;
  port: number;
  close(): Promise<void>;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

/** How many ports past the first to try before giving up. */
const PORT_TRIES = 20;
/** The settings are a few hundred bytes. A body larger than this is not them. */
const BODY_MAX = 8192;
const ALLOW = "GET, HEAD, POST, OPTIONS";

export async function startDesk(opts: DeskOptions = {}): Promise<Desk> {
  const staticDir = opts.staticDir ? resolve(opts.staticDir) : null;
  const storeDir = opts.storeDir ?? mozgHome();
  const logsDir = opts.logsDir ?? claudeProjectsDir();
  const startedAt = new Date().toISOString();
  const plugin = pluginInfo();
  let cached: { mtime: number; store: Store } | null = null;

  async function store(): Promise<Store> {
    // Re-read only when a file changed: an explain-back lands in state.json,
    // a change in the log. Both are checked, or a verdict recorded a moment ago
    // would wait for the agent's next edit to appear.
    const stamp = async (name: string) => (await stat(join(storeDir, name)).catch(() => null))?.mtimeMs ?? 0;
    const mtime = (await stamp("changes.ndjson")) + (await stamp("state.json")) / 1e6;
    if (!cached || cached.mtime !== mtime) {
      cached = { mtime, store: await Store.open(storeDir) };
    }
    return cached.store;
  }

  // One build at a time. The language is one value for the whole process, and
  // two builds overlapping would speak two languages into one page.
  let building: Promise<unknown> = Promise.resolve();
  function state(asked: string | null): Promise<unknown> {
    const run = building.then(async () => {
      // The sample is built from nothing and reads nobody's files.
      if (opts.sample) return sampleDesk();
      const current = await store();
      setLanguage(isLang(asked) ? asked : languageFor(current.settings.language));
      return {
        ...buildDeskState({ changes: current.changes, explains: current.explains, now: new Date(), hidden: current.settings.hidden }),
        settings: current.settings,
        connection: await connection(current),
      };
    });
    building = run.catch(() => {});
    return run;
  }

  /** How this desk is attached to the agent, each line from something a process wrote down. */
  async function connection(current: Store): Promise<Connection> {
    const newest = new Map<string, string>();
    for (const c of current.changes) {
      if ((newest.get(c.project) ?? "") < c.at) newest.set(c.project, c.at);
    }
    return {
      version: VERSION,
      plugin,
      logsDir,
      storeDir,
      home: homedir(),
      logs: current.logCount,
      sessions: new Set(current.changes.map((c) => c.session)).size,
      changes: current.changes.length,
      explains: current.explains.length,
      projects: [...newest].sort((a, b) => b[1].localeCompare(a[1])).map(([project]) => ({ project, name: projectName(project) })),
      indexedAt: current.lastIndexedAt,
      indexComplete: current.indexComplete,
      startedAt,
      pulses: await current.pulses(),
    };
  }

  /** The one thing that writes. See the note at the top of the file for the three guards. */
  async function saveSettings(req: IncomingMessage, res: ServerResponse) {
    res.setHeader("Cache-Control", "no-store");
    allowLocalPage(req, res);
    if (opts.sample) return json(res, 403, { error: "The sample desk is read-only." });
    if (req.headers.origin && !isLoopback(hostnameOf(req.headers.origin))) {
      return plain(res, 403, "Only a page on this machine may change the settings.");
    }
    // A page on another site can make a browser post a form, never JSON.
    if (!/^application\/json\b/i.test(req.headers["content-type"] ?? "")) {
      return plain(res, 415, "Send the settings as JSON.");
    }
    const body = await readBody(req, BODY_MAX);
    if (body === null) return plain(res, 413, "That is too much to be the settings.");
    let sent: unknown;
    try {
      sent = JSON.parse(body);
    } catch {
      return plain(res, 400, "That is not JSON.");
    }
    const current = await Store.light(storeDir);
    const next = mergeSettings(sent, current.settings);
    if (!next) return plain(res, 400, "That is not a setting mozg knows, or not a value it can hold.");
    await current.setSettings(next);
    cached = null;
    return json(res, 200, { settings: next });
  }

  const server = createServer((req, res) => {
    void handle(req, res).catch(() => {
      if (!res.headersSent) plain(res, 500, "Something went wrong reading the desk.");
      else res.end();
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    let path = url.pathname;
    try {
      path = decodeURIComponent(path);
    } catch {
      return plain(res, 400, "Bad path.");
    }

    // Every request, read or write: the address has to name this machine.
    if (!isLoopback(hostnameOf(req.headers.host ?? ""))) {
      return plain(res, 403, "The desk answers only on this machine.");
    }

    if (req.method === "OPTIONS") {
      res.setHeader("Allow", ALLOW);
      allowLocalPage(req, res, true);
      return res.writeHead(204).end();
    }

    if (req.method === "POST") {
      if (path === "/api/settings") return saveSettings(req, res);
      if (path.startsWith("/api/")) return json(res, 404, { error: "Nothing to write there." });
      res.setHeader("Allow", ALLOW);
      return plain(res, 405, "The desk reads, and the settings write. Nothing else does either.");
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", ALLOW);
      return plain(res, 405, "The desk reads, and the settings write. Nothing else does either.");
    }

    if (path.startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store");
      allowLocalPage(req, res);
      if (path === "/api/health") {
        return json(res, 200, { ok: true, version: VERSION, pid: process.pid, sample: Boolean(opts.sample) });
      }
      if (path === "/api/state") return json(res, 200, await state(url.searchParams.get("lang")));
      return json(res, 404, { error: "Not found." });
    }

    if (!staticDir) {
      return plain(
        res,
        501,
        "This build does not carry the desk page. In development it runs on the Next dev server at /desk/.",
      );
    }
    if (path === "/" || path === "/desk") {
      res.writeHead(308, { Location: "/desk/" });
      return res.end();
    }
    // The page is exported under desk/ and shares Next's asset folders.
    const shared =
      path.startsWith("/_next/") ||
      path.startsWith("/fonts/") ||
      path.startsWith("/brand/") ||
      path === "/favicon.ico" ||
      path === "/icon.svg";
    if (!shared && path !== "/desk/" && !path.startsWith("/desk/")) return plain(res, 404, "Not found.");

    let file = resolve(staticDir, path.slice(1) || "desk/index.html");
    if (file !== staticDir && !file.startsWith(staticDir + sep)) return plain(res, 404, "Not found.");
    const info = await stat(file).catch(() => null);
    if (info?.isDirectory()) file = join(file, "index.html");
    const final = await stat(file).catch(() => null);
    if (!final?.isFile()) return plain(res, 404, "Not found.");

    const type = extname(file).toLowerCase();
    res.setHeader("Content-Type", MIME[type] ?? "application/octet-stream");
    // Hashed chunks never change; an HTML shell must always be asked for afresh.
    res.setHeader(
      "Cache-Control",
      path.startsWith("/_next/static/") ? "public, max-age=31536000, immutable" : "no-cache",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method === "HEAD") {
      res.writeHead(200, { "Content-Length": final.size });
      return res.end();
    }
    createReadStream(file).pipe(res);
  }

  const port = await listen(server, opts.port ?? DESK_PORT);
  const url = `http://127.0.0.1:${port}/desk/`;
  return {
    url,
    port,
    close: () =>
      new Promise<void>((done) => {
        server.closeAllConnections?.();
        server.close(() => done());
      }),
  };
}

function listen(server: Server, first: number): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    let attempt = 0;
    server.on("error", (err: NodeJS.ErrnoException) => {
      // Taken: the desk of another session, most likely. Try the next one.
      if (err.code === "EADDRINUSE" && attempt < PORT_TRIES && first !== 0) {
        attempt++;
        server.listen(first + attempt, "127.0.0.1");
      } else {
        reject(err);
      }
    });
    server.listen(first === 0 ? 0 : first, "127.0.0.1", () => {
      resolvePromise((server.address() as AddressInfo).port);
    });
  });
}

/** The host part of a Host or Origin header, without port or brackets. */
function hostnameOf(value: string): string {
  return value
    .trim()
    .replace(/^[a-z]+:\/\//i, "")
    .replace(/:\d+$/, "")
    .replace(/^\[(.*)\]$/, "$1")
    .toLowerCase();
}

/** Loopback and nothing else: 127.0.0.1, localhost, ::1. */
function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "::1" || /^127\.\d+\.\d+\.\d+$/.test(hostname);
}

/**
 * A page served by the dev server on another local port may read the numbers,
 * and ask before it does. Only local pages: the Origin has to name loopback,
 * so a site open in a tab cannot read what somebody's agent has been changing,
 * and its question to write is answered without permission.
 */
function allowLocalPage(req: IncomingMessage, res: ServerResponse, preflight = false): void {
  const origin = req.headers.origin;
  if (!origin) return;
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return;
  }
  if (isLoopback(host)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  if (preflight) {
    res.setHeader("Access-Control-Allow-Methods", ALLOW);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
}

/** The body as text, or null when it is too large or could not be read. */
function readBody(req: IncomingMessage, limit: number): Promise<string | null> {
  return new Promise((done) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    req.on("data", (chunk: Buffer) => {
      // Past the limit the rest is drained, not kept: it is already not the settings.
      if (over) return;
      size += chunk.length;
      if (size > limit) {
        over = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => done(over ? null : Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => done(null));
  });
}

/**
 * The plugin this server was packed into: `plugin/dist/server.mjs` has the
 * manifest one folder up. Running from source there is none, and the desk
 * says so rather than inventing a name.
 */
export function pluginInfo(): Connection["plugin"] {
  const file = join(dirname(fileURLToPath(import.meta.url)), "..", ".claude-plugin", "plugin.json");
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { name?: unknown; version?: unknown };
    return typeof raw.name === "string" && raw.name ? { name: raw.name, version: typeof raw.version === "string" ? raw.version : VERSION } : null;
  } catch {
    return null;
  }
}

function json(res: import("node:http").ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

function plain(res: import("node:http").ServerResponse, status: number, text: string): void {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

// ─── one desk per machine ───────────────────────────────────────────────────

interface DeskRecord {
  port: number;
  pid: number;
  at: string;
}

export function deskRecord(storeDir = mozgHome()): string {
  return join(storeDir, "desk.json");
}

/** True when something answers like the desk on that port. */
export async function deskAlive(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(800) });
    return res.ok && Boolean((await res.json())?.ok);
  } catch {
    return false;
  }
}

/**
 * The desk that is already running, or a new one. Every session spawns its own
 * mozg server, and "open the desk" from two of them must not mean two desks.
 */
export async function ensureDesk(opts: DeskOptions & { record?: string | null } = {}): Promise<Desk> {
  const record = opts.record === undefined ? deskRecord(opts.storeDir) : opts.record;
  if (record) {
    const running = await readFile(record, "utf8")
      .then((text) => JSON.parse(text) as DeskRecord)
      .catch(() => null);
    if (running?.port && (await deskAlive(running.port))) {
      return { url: `http://127.0.0.1:${running.port}/desk/`, port: running.port, close: async () => {} };
    }
  }
  const desk = await startDesk(opts);
  if (record) {
    const info: DeskRecord = { port: desk.port, pid: process.pid, at: new Date().toISOString() };
    await mkdir(dirname(record), { recursive: true });
    await writeFile(record, JSON.stringify(info)).catch(() => {});
  }
  return desk;
}

/** Open a URL in the person's browser, best effort. Nothing to do if there is none. */
export function openInBrowser(url: string): void {
  const [cmd, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
  } catch {
    // No browser to open is not an error worth showing.
  }
}
