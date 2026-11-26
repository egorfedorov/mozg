/**
 * The local store: `~/.mozg/`.
 *
 * Two files. `changes.ndjson` is an append-only log, one change per line, so a
 * session ending never rewrites history. `state.json` holds everything small:
 * the explain-backs, where each session log has been read to, and the settings.
 *
 * Source code is never stored. A change keeps a pointer to its line in the
 * session log and goes back for the text only when somebody is about to
 * explain it.
 *
 * Several processes write here (see lock.ts), so every write re-reads
 * `state.json` from disk first instead of trusting its own copy. For changes
 * it goes further: under the lock it reads `changes.ndjson` back before it
 * appends, so a change that another process has already written is not
 * written again. On a first session three readers start at once (the hook,
 * the hook's background read and the MCP server's), and without that each of
 * them appends the same lines.
 *
 * A long-lived process calls `sync()` before it answers, to take what the
 * others wrote since it loaded: the MCP server of a session outlives many
 * turns, and the hook at the end of each of them adds to the store.
 */

import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withLock } from "./lock";
import type { Change, Explain, Pulse, Settings } from "./types";

export type { Pulse };

export interface FileMark {
  /** Size and mtime when it was last read, to notice a replaced file. */
  size: number;
  mtime: number;
  /** Byte offset just past the last complete line read. */
  offset: number;
}

interface Meta {
  version: 1;
  /** Moved up by one on every write: how another process sees it is behind. */
  rev: number;
  explains: Explain[];
  index: Record<string, FileMark>;
  settings: Settings;
  /** Session → when it was last nudged about unexplained changes. */
  nudged: Record<string, string>;
  /** Session → module → when the gate last asked about it. The gate asks once per module per session. */
  asked: Record<string, Record<string, string>>;
  lastIndexedAt: string | null;
  /** False when the last read stopped early and older logs are still waiting. */
  indexDone: boolean;
}

export const DEFAULT_SETTINGS: Settings = { nudge: "gentle", asks: true, language: "system", hidden: [] };

const EMPTY: Meta = {
  version: 1,
  rev: 0,
  explains: [],
  index: {},
  settings: DEFAULT_SETTINGS,
  nudged: {},
  asked: {},
  lastIndexedAt: null,
  indexDone: false,
};

const NO_PULSES: Record<Pulse, string | null> = { mcpStarted: null, mcpCalled: null, sessionStart: null };
const PULSES: Pulse[] = ["mcpStarted", "mcpCalled", "sessionStart"];

/** The file a pulse is kept in. */
const pulseFile = (pulse: Pulse) => `pulse-${pulse}`;

export function newId(): string {
  return randomBytes(9).toString("base64url");
}

export class Store {
  private constructor(
    readonly dir: string,
    private meta: Meta,
    /** Every change ever read, unique by id, oldest first. */
    private held: Change[],
    /** Pulses of a store with no folder, kept in memory for tests. */
    private memory: Partial<Record<Pulse, string>> = {},
  ) {}

  /**
   * Every change ever read, unique by id, oldest first. What this process
   * knows; call `sync()` first when another may have written since it loaded.
   */
  get changes(): Change[] {
    return this.held;
  }

  get explains(): Explain[] {
    return this.meta.explains;
  }

  get settings(): Settings {
    return this.meta.settings;
  }

  /** Where a log was read to, if ever. */
  mark(path: string): FileMark | undefined {
    return this.meta.index[path];
  }

  /** How many session logs have been read, at least in part. */
  get logCount(): number {
    return Object.keys(this.meta.index).length;
  }

  /**
   * When each part of the plugin last showed it was alive, or null.
   *
   * Each pulse is its own one-line file, written without the lock: a hook at
   * the start of a session must never wait behind another process, and a torn
   * read costs one stale timestamp, never a wrong one.
   */
  async pulses(): Promise<Record<Pulse, string | null>> {
    if (!this.dir) return { ...NO_PULSES, ...this.memory };
    const out = { ...NO_PULSES };
    await Promise.all(
      PULSES.map(async (pulse) => {
        const text = await readFile(join(this.dir, pulseFile(pulse)), "utf8").catch(() => "");
        if (text.trim()) out[pulse] = text.trim();
      }),
    );
    return out;
  }

  get lastIndexedAt(): string | null {
    return this.meta.lastIndexedAt;
  }

  /** When a session was last nudged, if ever. */
  nudgeAt(session: string): string | null {
    return this.meta.nudged[session] ?? null;
  }

  /** When the gate last asked this session about a module, if it did. */
  askedAt(session: string, module: string): string | null {
    return this.meta.asked[session]?.[module] ?? null;
  }

  static async open(dir: string): Promise<Store> {
    await mkdir(dir, { recursive: true });
    const meta = await readMeta(dir);
    const read = await readChanges(dir);
    // A store written before this rule, or by a race, can hold a line twice.
    // It already reads as one; it is written out once so it stays small.
    if (read.rows > read.changes.length) await compact(dir);
    return new Store(dir, meta, read.changes);
  }

  /**
   * Take what other processes wrote since this one loaded. Cheap when nothing
   * did: one small file read.
   */
  async sync(): Promise<void> {
    if (!this.dir) return;
    const meta = await readMeta(this.dir);
    if (meta.rev === this.meta.rev) return;
    this.held = (await readChanges(this.dir)).changes;
    this.meta = meta;
  }

  /** A store that was never written to: for the sample board and for tests. */
  static blank(dir = ""): Store {
    return new Store(dir, structuredClone(EMPTY), []);
  }

  /** Only the small half: what a hook needs to stay fast. */
  static async light(dir: string): Promise<Store> {
    await mkdir(dir, { recursive: true });
    return new Store(dir, await readMeta(dir), []);
  }

  /** Every write goes through here, under the lock, on a fresh copy. */
  private async save(patch: (meta: Meta) => void | Promise<void>): Promise<void> {
    if (!this.dir) {
      await patch(this.meta);
      return;
    }
    await withLock(this.dir, async () => {
      const fresh = await readMeta(this.dir);
      fresh.rev += 1;
      await patch(fresh);
      const tmp = join(this.dir, `state.${process.pid}.tmp`);
      await writeFile(tmp, JSON.stringify(fresh));
      await rename(tmp, join(this.dir, "state.json"));
      this.meta = fresh;
    });
  }

  /** Record changes and move the read marks forward. */
  async record(changes: Change[], marks: Record<string, FileMark>): Promise<void> {
    await this.save(async (meta) => {
      let added: Change[];
      if (!this.dir) {
        const known = new Set(this.held.map((c) => c.id));
        added = changes.filter((c) => !known.has(c.id));
        this.held = [...this.held, ...added];
      } else {
        // Inside the lock, so two writers never interleave half a line. And
        // the file, not this process's memory, decides what is already there.
        const disk = await readChanges(this.dir);
        const known = new Set(disk.changes.map((c) => c.id));
        added = changes.filter((c) => !known.has(c.id));
        if (added.length) {
          await appendFile(
            join(this.dir, "changes.ndjson"),
            added.map((c) => `${JSON.stringify(c)}\n`).join(""),
          );
        }
        this.held = [...disk.changes, ...added];
      }
      this.held.sort((a, b) => a.at.localeCompare(b.at));
      for (const [path, mark] of Object.entries(marks)) mergeMark(meta.index, path, mark);
    });
  }

  async addExplain(explain: Explain): Promise<void> {
    await this.save((meta) => {
      meta.explains = meta.explains.filter((e) => e.id !== explain.id);
      meta.explains.push(explain);
    });
  }

  async setSettings(patch: Partial<Settings>): Promise<void> {
    await this.save((meta) => {
      meta.settings = { ...meta.settings, ...patch };
    });
  }

  /** Note that a part of the plugin is alive right now. */
  async touch(pulse: Pulse, at: string): Promise<void> {
    if (!this.dir) {
      this.memory[pulse] = at;
      return;
    }
    const file = join(this.dir, pulseFile(pulse));
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, at);
    await rename(tmp, file);
  }

  /** Note that the gate asked, so that it does not ask twice in one session. */
  async markAsked(session: string, module: string, at: string): Promise<void> {
    await this.save((meta) => {
      (meta.asked[session] ??= {})[module] = at;
      // A session only matters while it is alive; keep the recent ones.
      for (const key of Object.keys(meta.asked).slice(0, Math.max(0, Object.keys(meta.asked).length - 50))) delete meta.asked[key];
    });
  }

  async markNudged(session: string, at: string): Promise<void> {
    await this.save((meta) => {
      meta.nudged[session] = at;
      // A session id only matters while the session is alive; keep the recent ones.
      const keys = Object.keys(meta.nudged);
      for (const key of keys.slice(0, Math.max(0, keys.length - 1000))) delete meta.nudged[key];
    });
  }

  get indexComplete(): boolean {
    return this.meta.indexDone;
  }

  async setIndexedAt(at: string, done: boolean): Promise<void> {
    await this.save((meta) => {
      meta.lastIndexedAt = at;
      meta.indexDone = done;
    });
  }
}

/** An older build kept a bare list of nudged sessions; it carries no time, so it dates nothing. */
function nudgedOf(value: unknown): Record<string, string> {
  if (Array.isArray(value)) return Object.fromEntries(value.map((id) => [String(id), ""]));
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, string>) : {};
}

/** Furthest read wins: both readers saw the same lines up to the shorter one. */
function mergeMark(index: Record<string, FileMark>, path: string, mark: FileMark): void {
  const old = index[path];
  if (!old || mark.offset > old.offset || mark.size !== old.size || mark.mtime !== old.mtime) {
    index[path] = mark;
  }
}

async function readMeta(dir: string): Promise<Meta> {
  try {
    const raw = JSON.parse(await readFile(join(dir, "state.json"), "utf8")) as Partial<Meta>;
    return {
      version: 1,
      rev: typeof raw.rev === "number" ? raw.rev : 0,
      explains: Array.isArray(raw.explains) ? raw.explains : [],
      index: raw.index && typeof raw.index === "object" ? raw.index : {},
      settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
      nudged: nudgedOf(raw.nudged),
      asked: raw.asked && typeof raw.asked === "object" && !Array.isArray(raw.asked) ? (raw.asked as Record<string, Record<string, string>>) : {},
      lastIndexedAt: typeof raw.lastIndexedAt === "string" ? raw.lastIndexedAt : null,
      indexDone: raw.indexDone === true,
    };
  } catch {
    return structuredClone(EMPTY);
  }
}

/** Every change in the file, unique by id and oldest first, and how many lines there were. */
async function readChanges(dir: string): Promise<{ changes: Change[]; rows: number }> {
  let text: string;
  try {
    text = await readFile(join(dir, "changes.ndjson"), "utf8");
  } catch {
    return { changes: [], rows: 0 };
  }
  const byId = new Map<string, Change>();
  const lines = text.split("\n");
  for (const line of lines) {
    if (!line) continue;
    try {
      const c = JSON.parse(line) as Change;
      if (c && typeof c.id === "string") byId.set(c.id, c);
    } catch {
      // A torn last line from a crash. Everything before it still loads.
    }
  }
  return { changes: [...byId.values()].sort((a, b) => a.at.localeCompare(b.at)), rows: lines.filter(Boolean).length };
}

/** Write the changes out once each, under the lock and atomically. */
async function compact(dir: string): Promise<void> {
  await withLock(dir, async () => {
    const { changes, rows } = await readChanges(dir);
    if (rows <= changes.length) return;
    const tmp = join(dir, `changes.${process.pid}.tmp`);
    await writeFile(tmp, changes.map((c) => `${JSON.stringify(c)}\n`).join(""));
    await rename(tmp, join(dir, "changes.ndjson"));
  });
}
