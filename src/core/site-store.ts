/**
 * What the site's server remembers, in files: the threads of the chat, the
 * errors pages report, the announcements, and the drafts of a launch.
 *
 * No database. One file per thread, one file per other list, each replaced
 * whole under the lock (see lock.ts) so nothing ever reads a half-written
 * record. A solo operator's site is a few hundred files at most, and a
 * backup is a copy of one folder.
 *
 * The browser's secret that opens a thread is never kept: only its hash.
 */

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withLock } from "./lock";

export type Author = "visitor" | "operator";

export interface ChatMessage {
  id: string;
  author: Author;
  body: string;
  at: string;
}

export interface ChatThread {
  id: string;
  /** SHA-256 of the secret the browser keeps, in hex. */
  key: string;
  /** The language of the page the thread was opened on. */
  lang: string;
  /** The path of that page. */
  page: string;
  createdAt: string;
  /** Set once the visitor has confirmed it by mail. */
  email: string | null;
  messages: ChatMessage[];
  /** When the operator last read it. A visitor's message after that is waiting. */
  readAt: string;
  /** When the visitor last saw it. An operator's message after that is news to them. */
  seenAt: string;
}

export interface SiteError {
  id: string;
  message: string;
  /** The page it happened on. */
  url: string;
  stack: string;
  count: number;
  firstAt: string;
  lastAt: string;
  resolvedAt: string | null;
}

export type AnnouncementKind = "news" | "notice" | "maintenance";

export interface Announcement {
  id: string;
  kind: AnnouncementKind;
  title: string;
  body: string;
  link: string;
  startsAt: string;
  /** Null: it stays until it is retired. */
  endsAt: string | null;
  published: boolean;
  createdAt: string;
}

export interface Draft {
  id: string;
  channel: string;
  title: string;
  body: string;
  updatedAt: string;
}

/** A thread as it leaves the server: without the hash of its key. */
export type PublicThread = Omit<ChatThread, "key">;

export const hashOf = (secret: string): string => createHash("sha256").update(secret).digest("hex");
export const newId = (bytes = 12): string => randomBytes(bytes).toString("hex");

/** Limits in the shape of the records, so nothing larger is ever written. */
export const LIMITS = {
  body: 4000,
  title: 120,
  announcement: 2000,
  messages: 200,
  threads: 5000,
} as const;

const clip = (text: unknown, max: number): string => (typeof text === "string" ? text.replace(/\s+/g, " ").trim().slice(0, max) : "");

export class SiteStore {
  private constructor(readonly dir: string) {}

  static async open(dir: string): Promise<SiteStore> {
    await mkdir(join(dir, "threads"), { recursive: true });
    return new SiteStore(dir);
  }

  // ─── chat ────────────────────────────────────────────────────────────────

  private threadFile(id: string): string {
    // Only what was made here: an id is read from the address bar of a browser.
    if (!/^[a-f0-9]{16,64}$/.test(id)) throw new Error("not a thread id");
    return join(this.dir, "threads", `${id}.json`);
  }

  async thread(id: string): Promise<ChatThread | null> {
    try {
      return JSON.parse(await readFile(this.threadFile(id), "utf8")) as ChatThread;
    } catch {
      return null;
    }
  }

  async threads(): Promise<ChatThread[]> {
    const names = (await readdir(join(this.dir, "threads")).catch(() => [] as string[])).filter((n) => n.endsWith(".json"));
    const out: ChatThread[] = [];
    for (const name of names) {
      try {
        out.push(JSON.parse(await readFile(join(this.dir, "threads", name), "utf8")) as ChatThread);
      } catch {
        /* one unreadable file is not the list */
      }
    }
    return out;
  }

  async createThread(input: { key: string; lang: string; page: string }): Promise<ChatThread> {
    const now = new Date().toISOString();
    const thread: ChatThread = { id: newId(), key: input.key, lang: input.lang, page: input.page, createdAt: now, email: null, messages: [], readAt: now, seenAt: now };
    await writeFile(this.threadFile(thread.id), `${JSON.stringify(thread)}\n`, { flag: "wx" });
    return thread;
  }

  /** Reads a thread, changes it, writes it back: all three under the lock. */
  async changeThread<T>(id: string, change: (thread: ChatThread) => T): Promise<{ thread: ChatThread; result: T } | null> {
    const file = this.threadFile(id);
    return withLock(this.dir, async () => {
      const raw = await readFile(file, "utf8").catch(() => null);
      if (raw === null) return null;
      const thread = JSON.parse(raw) as ChatThread;
      const result = change(thread);
      await writeFile(`${file}.${process.pid}.tmp`, `${JSON.stringify(thread)}\n`);
      await rename(`${file}.${process.pid}.tmp`, file);
      return { thread, result };
    });
  }

  async deleteThread(id: string): Promise<boolean> {
    const file = this.threadFile(id);
    return withLock(this.dir, async () => {
      try {
        await rm(file);
        return true;
      } catch {
        return false;
      }
    });
  }

  // ─── the single-file lists ───────────────────────────────────────────────

  private async list<T>(name: string): Promise<T[]> {
    try {
      const parsed = JSON.parse(await readFile(join(this.dir, name), "utf8")) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  private async change<T>(name: string, change: (list: T[]) => void): Promise<T[]> {
    return withLock(this.dir, async () => {
      const file = join(this.dir, name);
      const list = await this.list<T>(name);
      change(list);
      await writeFile(`${file}.${process.pid}.tmp`, `${JSON.stringify(list, null, 1)}\n`);
      await rename(`${file}.${process.pid}.tmp`, file);
      return list;
    });
  }

  // ─── errors ──────────────────────────────────────────────────────────────

  errors(): Promise<SiteError[]> {
    return this.list<SiteError>("errors.json");
  }

  /**
   * Files one report. A page throwing sixty times a second is one error, not
   * sixty thousand: the same message, still open, inside the hour adds to its
   * count. Returns the error it filed, or null when nothing was written.
   */
  async addError(input: { message: string; url: string; stack: string }): Promise<SiteError | null> {
    const message = clip(input.message, 500);
    if (!message) return null;
    const now = new Date().toISOString();
    const list = await this.change<SiteError>("errors.json", (all) => {
      const open = all.find((e) => e.resolvedAt === null && e.message === message && Date.parse(e.lastAt) > Date.now() - 3_600_000);
      if (open) {
        open.count += 1;
        open.lastAt = now;
        open.url = clip(input.url, 300) || open.url;
        return;
      }
      all.unshift({ id: newId(), message, url: clip(input.url, 300), stack: clip(input.stack, 4000), count: 1, firstAt: now, lastAt: now, resolvedAt: null });
      // The list is for reading, not for keeping everything forever.
      if (all.length > 2000) all.length = 2000;
    });
    return list.find((e) => e.message === message && e.resolvedAt === null) ?? null;
  }

  /** Marks errors solved. Every one of them when `id` is "all". */
  async resolveErrors(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.change<SiteError>("errors.json", (all) => {
      for (const e of all) if (id === "all" || e.id === id) e.resolvedAt = now;
    });
  }

  // ─── announcements ───────────────────────────────────────────────────────

  announcements(): Promise<Announcement[]> {
    return this.list<Announcement>("announcements.json");
  }

  async putAnnouncement(input: Omit<Announcement, "id" | "createdAt"> & { id?: string }): Promise<Announcement> {
    let saved: Announcement | null = null;
    await this.change<Announcement>("announcements.json", (all) => {
      const id = input.id ?? newId();
      saved = { ...input, id, createdAt: new Date().toISOString() };
      const at = all.findIndex((a) => a.id === id);
      if (at >= 0) all[at] = saved;
      else all.unshift(saved);
    });
    return saved!;
  }

  async retireAnnouncement(id: string): Promise<void> {
    await this.change<Announcement>("announcements.json", (all) => {
      for (const a of all) if (a.id === id) a.published = false;
    });
  }

  // ─── drafts ──────────────────────────────────────────────────────────────

  drafts(): Promise<Draft[]> {
    return this.list<Draft>("drafts.json");
  }

  async putDraft(input: Omit<Draft, "id" | "updatedAt"> & { id?: string }): Promise<Draft> {
    let saved: Draft | null = null;
    await this.change<Draft>("drafts.json", (all) => {
      const id = input.id ?? newId(8);
      saved = { id, channel: input.channel, title: input.title, body: input.body, updatedAt: new Date().toISOString() };
      const at = all.findIndex((d) => d.id === id);
      if (at >= 0) all[at] = saved;
      else all.push(saved);
    });
    return saved!;
  }

  // ─── everything, for a backup ────────────────────────────────────────────

  /** All of it in one object, without the hashes of any thread's key. */
  async exportAll(): Promise<{ exportedAt: string; threads: PublicThread[]; errors: SiteError[]; announcements: Announcement[]; drafts: Draft[] }> {
    const threads = await this.threads();
    return {
      exportedAt: new Date().toISOString(),
      threads: threads.map((thread) => {
        const { key, ...rest } = thread;
        void key;
        return rest;
      }),
      errors: await this.errors(),
      announcements: await this.announcements(),
      drafts: await this.drafts(),
    };
  }
}

/** The waiting count of a thread for the operator: what the visitor said since they last read it. */
export const waitingIn = (thread: ChatThread): number => thread.messages.filter((m) => m.author === "visitor" && m.at > thread.readAt).length;

/** What the visitor has not seen yet: what the operator said since they last looked. */
export const unseenIn = (thread: ChatThread): number => thread.messages.filter((m) => m.author === "operator" && m.at > thread.seenAt).length;
