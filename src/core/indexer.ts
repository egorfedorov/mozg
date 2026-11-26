/**
 * Reading the logs into the store.
 *
 * Every log is read from where it was left off last time, so a session that
 * ends costs one short read and not a re-read of its whole history. A file
 * that shrank is a new file under an old name and starts over.
 *
 * One read of one file is capped (see transcript.ts), so a log of many
 * hundreds of megabytes takes more than one pass. A pass says so: "done" is
 * true only when every log has been read to its end. A pass that has to
 * answer quickly leaves such logs to a background pass altogether.
 */

import { readdir, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { claudeProjectsDir } from "./paths";
import type { FileMark, Store } from "./store";
import { TOOL_MARKER, changesFrom, readLines } from "./transcript";

export interface IndexOne {
  changes: number;
  reset: boolean;
  /** False when there is more of the file to read next time, or it went away mid-read. */
  complete: boolean;
}

export async function indexFile(store: Store, path: string, opts: { maxBytes?: number } = {}): Promise<IndexOne> {
  const before = await stat(path).catch(() => null);
  if (!before) return { changes: 0, reset: false, complete: true };

  const mark = store.mark(path);
  // Fully read and untouched since: the common case, and it costs one stat.
  if (mark && mark.offset >= before.size && mark.mtime === before.mtimeMs) {
    return { changes: 0, reset: false, complete: true };
  }

  const read = await readLines(path, mark?.offset ?? 0, TOOL_MARKER, opts.maxBytes);
  const session = basename(path).replace(/\.jsonl$/, "");
  let changes = changesFrom(read.lines, path, session);

  // A subagent's own log never records who let a call through. Its session's
  // main log does record the permission mode, and in a mode that does not ask,
  // nobody was asked for the subagent's edits either.
  if (changes.some((c) => c.approvedBy === "unknown")) {
    const mode = await sessionMode(parentLogs(path, changes[0].session));
    if (mode && UNATTENDED_MODES.has(mode)) {
      changes = changes.map((c) => (c.approvedBy === "unknown" ? { ...c, approvedBy: "auto" } : c));
    }
  }

  // Sized after the read: a session still being written to grows meanwhile,
  // and the mark must describe the file as it is now or the tail is never read.
  const after = await stat(path).catch(() => null);
  if (!after) return { changes: changes.length, reset: read.reset, complete: false };

  const next: FileMark = { size: after.size, mtime: after.mtimeMs, offset: read.offset };
  await store.record(changes, { [path]: next });
  return { changes: changes.length, reset: read.reset, complete: read.offset >= after.size };
}

/** Permission modes in which edits are not put to a person. */
const UNATTENDED_MODES = new Set(["auto", "acceptEdits", "bypassPermissions", "dontAsk"]);

/**
 * Where a subagent log's session may keep its main log. A subagent log sits
 * at `<project>/<session>/subagents/…`, so the main log is the file beside
 * that folder, named for the session.
 */
export function parentLogs(subagentLog: string, session: string): string[] {
  const at = subagentLog.lastIndexOf("/subagents/");
  if (at < 0) return [];
  const folder = subagentLog.slice(0, at);
  const project = dirname(folder);
  return [...new Set([join(project, `${session}.jsonl`), join(project, `${basename(folder)}.jsonl`)])];
}

const modes = new Map<string, { mtime: number; mode: string | null }>();

/**
 * The permission mode a session was last in. The main log notes every change
 * of mode as its own entry, so the last one is how the session ended up; read
 * once per version of the file, since the subagents of one session share it.
 */
export async function sessionMode(mainLogs: string[]): Promise<string | null> {
  for (const mainLog of mainLogs) {
    const info = await stat(mainLog).catch(() => null);
    if (!info) continue;
    const known = modes.get(mainLog);
    if (known && known.mtime === info.mtimeMs) return known.mode;

    let mode: string | null = null;
    try {
      const { lines } = await readLines(mainLog, 0, '"permission-mode"');
      for (const { json } of lines) {
        const entry = json as { permissionMode?: unknown } | null;
        if (entry && typeof entry.permissionMode === "string") mode = entry.permissionMode;
      }
    } catch {
      mode = null;
    }
    modes.set(mainLog, { mtime: info.mtimeMs, mode });
    return mode;
  }
  return null;
}

/**
 * Every session log on the machine, newest first.
 *
 * Subagents keep their own logs under the session's folder, and so does every
 * step of a workflow; they edit files like anything else, and on this machine
 * they outnumber the main transcripts five to one.
 */
export async function listLogs(root = claudeProjectsDir()): Promise<{ path: string; mtime: number; size: number }[]> {
  const out: { path: string; mtime: number; size: number }[] = [];
  await walk(root, out, 0);
  return out.sort((a, b) => b.mtime - a.mtime);
}

const MAX_DEPTH = 6;
/** What a pass that must answer quickly will read of one log. The rest waits for a background pass. */
const QUICK_MAX_BYTES = 8 * 1024 * 1024;

async function walk(dir: string, out: { path: string; mtime: number; size: number }[], depth: number): Promise<void> {
  if (depth > MAX_DEPTH) return;
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const path = join(dir, name);
    const s = await stat(path).catch(() => null);
    if (!s) continue;
    if (s.isDirectory()) await walk(path, out, depth + 1);
    else if (s.isFile() && name.endsWith(".jsonl")) out.push({ path, mtime: s.mtimeMs, size: s.size });
  }
}

export interface IndexAll {
  files: number;
  changes: number;
  /** False while something is still waiting: a log the budget cut off, or one longer than a single read. */
  done: boolean;
}

/**
 * Read what is new across every log. The newest logs go first and the walk
 * stops when the budget is spent, so a caller that must answer quickly (a hook,
 * a status call) still gets the present, and a background pass gets the past.
 */
export async function indexAll(
  store: Store,
  opts: { budgetMs?: number; root?: string; only?: (path: string) => boolean; maxBytes?: number } = {},
): Promise<IndexAll> {
  const budget = opts.budgetMs ?? Infinity;
  const started = Date.now();
  const logs = await listLogs(opts.root);
  let files = 0;
  let changes = 0;
  let done = true;
  for (const log of logs) {
    if (opts.only && !opts.only(log.path)) continue;
    if (Date.now() - started > budget) {
      done = false;
      break;
    }
    if (log.size === 0) continue;
    // Reading a few hundred megabytes is not quick, whichever order the logs
    // come in. A pass that must answer leaves the long ones to a background pass.
    const unread = log.size - (store.mark(log.path)?.offset ?? 0);
    if (budget !== Infinity && unread > QUICK_MAX_BYTES) {
      done = false;
      continue;
    }
    try {
      const one = await indexFile(store, log.path, { maxBytes: opts.maxBytes });
      files++;
      changes += one.changes;
      if (!one.complete) done = false;
    } catch {
      // A log that cannot be read now will be tried again next time.
      done = false;
    }
  }
  await store.setIndexedAt(new Date().toISOString(), done);
  return { files, changes, done };
}
