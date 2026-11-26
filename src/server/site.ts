/**
 * The site's server: the one piece of mozg that runs in public.
 *
 * The site itself is a static export and sits on any host. This file sits
 * beside it and answers for what a static page cannot do alone: the chat, the
 * errors its pages report, the announcements the operator posts, and the
 * operator's own panel. The plugin never talks to it. Nothing on a person's
 * machine knows this server exists, and "nothing leaves your machine" stays
 * true of the plugin.
 *
 * What a request must pass, in order:
 *
 * - Only the site's own pages may talk to the API. A request with another
 *   site's Origin is not served at all, and a write needs the site's.
 * - A body is JSON, and never larger than its route needs.
 * - A thread is opened by a secret the browser keeps; the server keeps only
 *   its hash. A wrong secret is "not found": a thread's existence is not told.
 * - The operator panel is opened by a link sent to one address, once; the
 *   session that follows is a signed cookie nobody else can forge.
 * - Everything is counted per address, and over the count is refused. The
 *   address itself is hashed with a salt that lives in this process and is
 *   never written down.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, resolve, sep } from "node:path";
import { systemLanguage } from "@/core/settings";
import {
  LIMITS,
  SiteStore,
  waitingIn,
  hashOf,
  newId,
  type Announcement,
  type AnnouncementKind,
  type ChatThread,
  type PublicThread,
  unseenIn,
} from "@/core/site-store";
import { withLock } from "@/core/lock";
import { VERSION } from "@/core/version";
import "@/i18n/messages";
import { isLang, setLanguage, t, type Lang } from "@/lib/i18n";
import type { Mailer } from "./mail";

export const SITE_PORT = 4318;
export const SITE_DATA_ENV = "MOZG_DATA";

export interface SiteOptions {
  /** The first port to try. Zero lets the system choose, as tests do. */
  port?: number;
  /** Behind a reverse proxy it is loopback; in a container's own network it is not. */
  host?: string;
  /** The folder of the static export. Null when another server serves the pages. */
  staticDir?: string | null;
  /** Where the threads, errors, announcements and drafts are kept. */
  dataDir?: string;
  /** The address the site is served from: the one the letters link back to. */
  origin?: string;
  /** Every address the pages may be served from and still talk to this server. */
  origins?: string[];
  operatorEmail?: string;
  /** Signs sessions and the links in letters. Required unless `dev`. */
  secret?: string;
  operatorLang?: Lang;
  /** Take the caller's address from X-Forwarded-For: only behind a proxy that sets it. */
  trustProxy?: boolean;
  mailer?: Mailer;
  /** Letters go to the console, and the login link is returned to the caller. */
  dev?: boolean;
}

export interface Site {
  url: string;
  port: number;
  origin: string;
  close(): Promise<void>;
}

/** A request refused, with the status and a short name for the reason. */
class Refused extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
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
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

const COOKIE = "mozg_operator";
const SESSION_DAYS = 30;
const LOGIN_MINUTES = 15;
const EMAIL_HOURS = 24;
/** How long a visitor waits between two messages, and how many they may send in an hour (as in the first mozg). */
const PAUSE_MS = 15_000;
const HOUR_MS = 3_600_000;
const ALLOW = "GET, HEAD, POST, DELETE, OPTIONS";
const KINDS: AnnouncementKind[] = ["news", "notice", "maintenance"];

export async function startSite(opts: SiteOptions = {}): Promise<Site> {
  const staticDir = opts.staticDir ? resolve(opts.staticDir) : null;
  const dataDir = resolve(opts.dataDir ?? process.env[SITE_DATA_ENV] ?? join(homedir(), ".mozg-site"));
  const store = await SiteStore.open(dataDir);
  const mailer = opts.mailer ?? (await import("./mail")).resendMailer();
  const dev = Boolean(opts.dev);
  // Without a secret there is nothing to sign with. In development a random
  // one does for the life of the process; in production it is a mistake to stop for.
  const secret = opts.secret || (dev ? randomBytes(32).toString("hex") : "");
  if (!secret) throw new Error("MOZG_SECRET is not set. It signs the operator's session and the links in letters: make one with `openssl rand -hex 32`.");
  const operatorEmail = (opts.operatorEmail ?? "").trim().toLowerCase();
  const operatorLang = opts.operatorLang ?? systemLanguage();
  const trustProxy = Boolean(opts.trustProxy);
  const startedAt = Date.now();
  const buckets = new Buckets();
  const salt = randomBytes(16).toString("hex");
  const lastMailAt = new Map<string, number>();

  // The language is one value for the whole process. Letters are written in
  // more than one: the operator's and each visitor's. So every letter is
  // written in its turn.
  let speaking: Promise<unknown> = Promise.resolve();
  const inLanguage = <T>(lang: Lang, write: () => Promise<T>): Promise<T> => {
    const turn = speaking.then(async () => {
      setLanguage(lang);
      return write();
    });
    speaking = turn.catch(() => {});
    return turn;
  };

  const server = createServer((req, res) => {
    void handle(req, res).catch((err) => {
      process.stderr.write(`site: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
      if (!res.headersSent) json(res, 500, { ok: false, error: "server" });
      else res.end();
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://site.invalid");
    let path = url.pathname;
    try {
      path = decodeURIComponent(path);
    } catch {
      return plain(res, 400, "Bad path.");
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

    if (req.method === "OPTIONS") {
      res.setHeader("Allow", ALLOW);
      const from = pageOrigin(req);
      if (from) allowPage(res, from, true);
      res.writeHead(204).end();
      return;
    }

    if (path === "/api/" || path.startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store");
      const from = pageOrigin(req);
      // Another site's page is answered nothing at all, and a write with no site
      // behind it is not a page's request.
      if (req.headers.origin ? !from : req.method !== "GET" && req.method !== "HEAD") return json(res, 403, { ok: false, error: "origin" });
      if (from) allowPage(res, from);
      try {
        return await api(req, res, path);
      } catch (err) {
        if (err instanceof Refused) return json(res, err.status, { ok: false, error: err.code });
        throw err;
      }
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      return plain(res, 405, "Pages are read. What writes is under /api/.");
    }
    if (!staticDir) return plain(res, 501, "This server does not carry the pages. They are served by another one.");
    return page(req, res, path);
  }

  /** The Origin of the request when it is one of the site's own; null otherwise. */
  function pageOrigin(req: IncomingMessage): string | null {
    const from = req.headers.origin;
    return from && allowed.has(from) ? from : null;
  }

  function allowPage(res: ServerResponse, from: string, preflight = false): void {
    res.setHeader("Access-Control-Allow-Origin", from);
    res.setHeader("Vary", "Origin");
    if (preflight) {
      res.setHeader("Access-Control-Allow-Methods", ALLOW);
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    }
  }

  // ─── the calls ───────────────────────────────────────────────────────────

  async function api(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    const parts = path.split("/").filter(Boolean); // ["api", …]
    const method = req.method ?? "GET";
    const ip = caller(req);

    if (parts.length === 2 && parts[1] === "health") {
      if (method !== "GET" && method !== "HEAD") throw new Refused(405, "method");
      return json(res, 200, { ok: true, version: VERSION });
    }
    if (parts.length === 2 && parts[1] === "announcements") {
      if (method !== "GET" && method !== "HEAD") throw new Refused(405, "method");
      return json(res, 200, { ok: true, announcements: await live() });
    }
    if (parts.length === 2 && parts[1] === "report") {
      if (method !== "POST") throw new Refused(405, "method");
      if (!buckets.allow(`report ${ip}`, 30, HOUR_MS)) return json(res, 200, { ok: true });
      const body = await readJson(req, 16_384);
      const message = text(body.message, 500);
      // Accepted and dropped, never refused: a reporter cannot act on a failure either way.
      if (!message || fromExtension(body.stack) || fromHostScript(message)) return json(res, 200, { ok: true });
      await store.addError({ message, url: text(body.url, 300), stack: text(body.stack, 4000) });
      return json(res, 200, { ok: true });
    }
    if (parts[1] === "chat") return chat(req, res, parts, method, ip);
    if (parts[1] === "operator") return operator(req, res, parts, method, ip);
    throw new Refused(404, "not_found");
  }

  async function chat(req: IncomingMessage, res: ServerResponse, parts: string[], method: string, ip: string): Promise<void> {
    // /api/chat/threads — open one
    if (parts.length === 3 && parts[2] === "threads" && method === "POST") {
      const body = await readJson(req, 4096);
      if (!buckets.allow(`open ${ip}`, 5, HOUR_MS)) throw new Refused(429, "too_many");
      const key = randomBytes(32).toString("base64url");
      const thread = await store.createThread({
        key: hashOf(key),
        lang: isLang(body.lang) ? body.lang : "en",
        page: text(body.page, 200) || "/",
      });
      return json(res, 200, { ok: true, id: thread.id, key, thread: shown(thread) });
    }

    // /api/chat/email/<token> — confirm an address from a letter
    if (parts.length === 4 && parts[2] === "email" && method === "GET") {
      const token = parts[3];
      const email = await takeEmailToken(token);
      res.writeHead(303, { Location: email ? `${origin}/?chat=${email.thread}&k=${mailKey(email.thread)}#chat` : `${origin}/#chat` });
      res.end();
      return;
    }

    // Everything else is about one thread, opened by its secret.
    if (parts.length < 4 || parts[2] !== "threads") throw new Refused(404, "not_found");
    const thread = await opened(parts[3], req.headers.authorization);
    const id = thread.id;

    // /api/chat/threads/<id> — read it
    if (parts.length === 4 && (method === "GET" || method === "HEAD")) {
      // Said before it is forgotten: reading the thread is seeing what was new.
      const unseen = unseenIn(thread);
      const latest = thread.messages[thread.messages.length - 1];
      if (latest?.author === "operator" && latest.at > thread.seenAt) {
        await store.changeThread(id, (one) => {
          one.seenAt = new Date().toISOString();
        });
        thread.seenAt = new Date().toISOString();
      }
      return json(res, 200, { ok: true, thread: shown(thread), unseen });
    }

    if (parts.length === 5 && parts[4] === "messages" && method === "POST") {
      const body = await readJson(req, 24_576);
      // The trap for machines: a field nobody can see. Filled in means filed nowhere.
      if (typeof body.website === "string" && body.website) return json(res, 200, { ok: true, message: { id: "", author: "visitor", body: String(body.body).slice(0, LIMITS.body), at: new Date().toISOString() } });
      const said = message(body.body);
      const mine = thread.messages.filter((m) => m.author === "visitor");
      const last = mine[mine.length - 1];
      if (last && Date.now() - Date.parse(last.at) < PAUSE_MS) throw new Refused(429, "too_soon");
      if (mine.filter((m) => Date.now() - Date.parse(m.at) < HOUR_MS).length >= 30) throw new Refused(429, "too_many");
      if (!buckets.allow(`say ${ip}`, 20, HOUR_MS)) throw new Refused(429, "too_many");
      if (thread.messages.length >= LIMITS.messages) throw new Refused(413, "full");
      const first = mine.length === 0;
      const saved = await store.changeThread(id, (one) => {
        one.messages.push({ id: newId(8), author: "visitor", body: said, at: new Date().toISOString() });
      });
      if (!saved) throw new Refused(404, "not_found");
      void tellOperator(saved.thread, said, first);
      return json(res, 200, { ok: true, message: saved.thread.messages[saved.thread.messages.length - 1] });
    }

    // /api/chat/threads/<id>/email — ask for replies by mail as well
    if (parts.length === 5 && parts[4] === "email" && method === "POST") {
      const body = await readJson(req, 2048);
      const email = text(body.email, 254).toLowerCase();
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
      // Not told whether it was taken: the answer is the same, so there is nothing to probe.
      if (ok && buckets.allow(`mail ${id}`, 3, HOUR_MS) && buckets.allow(`mail ${ip}`, 5, HOUR_MS)) {
        const token = newId(16);
        await changeList<{ hash: string; thread: string; email: string; expiresAt: string }>(dataDir, "email-tokens.json", (all) => {
          all.push({ hash: hashOf(token), thread: id, email, expiresAt: new Date(Date.now() + EMAIL_HOURS * HOUR_MS).toISOString() });
        });
        const link = `${origin}/api/chat/email/${token}`;
        void letter(isLang(thread.lang) ? thread.lang : "en", email, () => ({ subject: t("Your email for the mozg chat"), text: `${t("Confirm the address to get replies by mail as well as in the chat:")} ${link}` }));
      }
      return json(res, 200, { ok: true });
    }
    throw new Refused(404, "not_found");
  }

  async function operator(req: IncomingMessage, res: ServerResponse, parts: string[], method: string, ip: string): Promise<void> {
    // /api/operator/login — ask for the link
    if (parts.length === 3 && parts[2] === "login" && method === "POST") {
      const body = await readJson(req, 1024);
      if (!buckets.allow(`login ${ip}`, 5, HOUR_MS)) return json(res, 200, { ok: true });
      const asked = text(body.email, 254).toLowerCase();
      // The same answer either way: whether an address is the operator's is not told here.
      let link: string | null = null;
      if (operatorEmail && asked === operatorEmail) {
        const token = newId(24);
        await changeList<{ hash: string; expiresAt: string }>(dataDir, "login-tokens.json", (all) => {
          all.push({ hash: hashOf(token), expiresAt: new Date(Date.now() + LOGIN_MINUTES * 60_000).toISOString() });
        });
        link = `${origin}/api/operator/login/${token}`;
        await inLanguage(operatorLang, async () => {
          try {
            if (!mailer.configured) throw new Error("mail is not configured");
            await mailer.send(operatorEmail, t("mozg: your link to the panel"), `${t("This link opens the operator panel once and holds for fifteen minutes:")} ${link}`);
          } catch (err) {
            // Without mail the way in is the `token` command on the server. Said so, in the log.
            process.stderr.write(`site: the login link could not be mailed (${err instanceof Error ? err.message : String(err)}). Use: site-server token\n`);
          }
        });
      }
      return json(res, 200, { ok: true, ...(dev && link ? { link } : {}) });
    }

    // /api/operator/login/<token> — arrive from the letter
    if (parts.length === 4 && parts[2] === "login" && method === "GET") {
      const good = await takeLoginToken(parts[3]);
      if (!good) return plain(res, 400, "That link has been used or has expired. Ask for another.");
      res.writeHead(303, { "Set-Cookie": cookie(session()), Location: `${origin}/admin/` });
      res.end();
      return;
    }

    if (parts[2] === "logout" && method === "POST") {
      res.writeHead(200, { "Set-Cookie": cookie("", 0), "Content-Type": "application/json; charset=utf-8" });
      res.end('{"ok":true}');
      return;
    }

    // Everything past here is the operator's.
    if (!sessionValid(cookieOf(req.headers.cookie ?? ""))) throw new Refused(401, "operator");

    if (parts.length === 3 && parts[2] === "overview" && method === "GET") {
      const threads = await store.threads();
      const errors = await store.errors();
      const announcements = await store.announcements();
      return json(res, 200, {
        ok: true,
        version: VERSION,
        startedAt: new Date(startedAt).toISOString(),
        mail: mailer.configured,
        origin,
        threads: { all: threads.length, waiting: threads.filter((one) => waitingIn(one) > 0).length },
        errors: { open: errors.filter((e) => e.resolvedAt === null).length },
        announcements: { live: (await live()).length, all: announcements.length },
        drafts: (await store.drafts()).length,
      });
    }

    if (parts[2] === "test-mail" && method === "POST") {
      if (!operatorEmail || !mailer.configured) return json(res, 200, { ok: false, error: "no_mail" });
      await inLanguage(operatorLang, () => mailer.send(operatorEmail, t("mozg: the mail is set up"), t("A letter from your own server. If you are reading this, the chat can reach you.")));
      return json(res, 200, { ok: true });
    }

    if (parts[2] === "export" && method === "GET") {
      res.setHeader("Content-Disposition", `attachment; filename="mozg-site-${new Date().toISOString().slice(0, 10)}.json"`);
      return json(res, 200, await store.exportAll());
    }

    if (parts[2] === "threads") {
      if (parts.length === 3 && method === "GET") {
        const threads = await store.threads();
        // Waiting first, then the most recently written.
        threads.sort((a, b) => Number(waitingIn(b) > 0) - Number(waitingIn(a) > 0) || lastAt(b) - lastAt(a));
        return json(res, 200, { ok: true, threads: threads.map(listed) });
      }
      if (parts.length === 5 && parts[4] === "reply" && method === "POST") {
        const body = await readJson(req, 24_576);
        const said = message(body.body);
        const saved = await store.changeThread(parts[3], (one) => {
          one.messages.push({ id: newId(8), author: "operator", body: said, at: new Date().toISOString() });
          one.readAt = new Date().toISOString();
        });
        if (!saved) throw new Refused(404, "not_found");
        const thread = saved.thread;
        if (thread.email) {
          const link = `${origin}/?chat=${thread.id}&k=${mailKey(thread.id)}#chat`;
          void letter(isLang(thread.lang) ? thread.lang : "en", thread.email, () => ({
            subject: t("mozg replied to your message"),
            text: `${said}\n\n${t("The whole thread:")} ${link}\n${t("Keep this link: it is the only way back to this conversation from another device.")}`,
          }));
        }
        return json(res, 200, { ok: true, message: thread.messages[thread.messages.length - 1] });
      }
      if (parts.length === 5 && parts[4] === "read" && method === "POST") {
        await store.changeThread(parts[3], (one) => {
          one.readAt = new Date().toISOString();
        });
        return json(res, 200, { ok: true });
      }
      if (parts.length === 4 && method === "DELETE") {
        return json(res, 200, { ok: await store.deleteThread(parts[3]) });
      }
    }

    if (parts[2] === "errors") {
      if (parts.length === 3 && method === "GET") return json(res, 200, { ok: true, errors: await store.errors() });
      if (parts.length === 4 && parts[3] === "resolve" && method === "POST") {
        const body = await readJson(req, 512);
        const id = text(body.id, 64);
        await store.resolveErrors(id || "all");
        return json(res, 200, { ok: true });
      }
    }

    if (parts[2] === "announcements") {
      if (parts.length === 3 && method === "GET") return json(res, 200, { ok: true, announcements: await store.announcements() });
      if (parts.length === 3 && method === "POST") {
        const saved = await store.putAnnouncement(announcement(await readJson(req, 16_384)));
        liveCache = null;
        return json(res, 200, { ok: true, announcement: saved });
      }
      if (parts.length === 4 && parts[3] === "retire" && method === "POST") {
        const body = await readJson(req, 256);
        await store.retireAnnouncement(text(body.id, 64));
        liveCache = null;
        return json(res, 200, { ok: true });
      }
    }

    if (parts[2] === "drafts") {
      if (parts.length === 3 && (method === "GET" || method === "PUT")) {
        if (method === "GET") return json(res, 200, { ok: true, drafts: await store.drafts() });
        const body = await readJson(req, 65_536);
        const draft = await store.putDraft({
          id: typeof body.id === "string" && body.id ? text(body.id, 32) : undefined,
          channel: text(body.channel, 40),
          title: text(body.title, 200),
          body: typeof body.body === "string" ? body.body.slice(0, 8000) : "",
        });
        return json(res, 200, { ok: true, draft });
      }
    }
    throw new Refused(404, "not_found");
  }

  // ─── the pages ───────────────────────────────────────────────────────────

  async function page(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    let file = resolve(staticDir!, "." + (path === "/" ? "/index.html" : path));
    if (file !== staticDir && !file.startsWith(staticDir! + sep)) return plain(res, 404, "Not found.");
    const info = await stat(file).catch(() => null);
    if (info?.isDirectory()) file = join(file, "index.html");
    let final = await stat(file).catch(() => null);
    let status = 200;
    // A static export writes no extension: /de/ is de/index.html, and anything else is the 404 page.
    if (!final?.isFile() && !extname(file)) {
      file = join(file + sep, "index.html");
      final = await stat(file).catch(() => null);
    }
    if (!final?.isFile()) {
      file = join(staticDir!, "404.html");
      final = await stat(file).catch(() => null);
      status = 404;
    }
    if (!final?.isFile()) return plain(res, 404, "Not found.");

    const admin = path === "/admin" || path.startsWith("/admin/");
    res.setHeader("Content-Type", MIME[extname(file).toLowerCase()] ?? "application/octet-stream");
    // Hashed assets never change; a page is always asked for afresh.
    res.setHeader("Cache-Control", path.startsWith("/_next/static/") ? "public, max-age=31536000, immutable" : admin ? "no-store" : "no-cache");
    if (admin) {
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
    }
    if (req.method === "HEAD") {
      res.writeHead(status, { "Content-Length": final.size });
      res.end();
      return;
    }
    res.writeHead(status, { "Content-Length": final.size });
    createReadStream(file).pipe(res);
  }

  // ─── the pieces the calls share ──────────────────────────────────────────

  /** The address a request came from, salted: enough to count by, nothing to keep. */
  function caller(req: IncomingMessage): string {
    const raw = trustProxy ? (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim() : "";
    return hashOf(salt + (raw || req.socket.remoteAddress || "?"));
  }

  /** A thread, if the secret opens it. Anything else is "not found". */
  async function opened(id: string, header: string | undefined): Promise<ChatThread> {
    const secret = header?.match(/^Bearer (\S{1,512})$/)?.[1];
    const thread = secret && /^[a-f0-9]{16,64}$/.test(id) ? await store.thread(id) : null;
    if (!thread || !secret) throw new Refused(404, "not_found");
    const hashed = hashOf(secret);
    const byKey = hashed.length === thread.key.length && timingSafeEqual(Buffer.from(hashed), Buffer.from(thread.key));
    const mail = mailKey(thread.id);
    if (!byKey && !(mail.length === secret.length && timingSafeEqual(Buffer.from(mail), Buffer.from(secret)))) throw new Refused(404, "not_found");
    return thread;
  }

  const mailKey = (id: string): string => createHmac("sha256", secret).update(`mail:${id}`).digest("hex");

  const shown = (thread: ChatThread): PublicThread => {
    const { key, ...rest } = thread;
    void key;
    return rest;
  };
  const listed = (one: ChatThread) => ({ ...shown(one), waiting: waitingIn(one) });
  const lastAt = (one: ChatThread): number => Date.parse(one.messages[one.messages.length - 1]?.at ?? one.createdAt);

  /** A new message, told to the operator by mail. At most one letter a minute per thread. */
  function tellOperator(thread: ChatThread, said: string, first: boolean): Promise<void> {
    const now = Date.now();
    if (!operatorEmail || !mailer.configured || (!first && now - (lastMailAt.get(thread.id) ?? 0) < 60_000)) return Promise.resolve();
    lastMailAt.set(thread.id, now);
    return inLanguage(operatorLang, () =>
      mailer.send(
        operatorEmail,
        t("chatmozg: a new message"),
        `${said}\n\n— ${thread.page} · ${thread.lang}\n${t("Reply at:")} ${origin}/admin/#chat`,
      ),
    ).catch((err) => {
      process.stderr.write(`site: a letter to the operator was not sent: ${err instanceof Error ? err.message : String(err)}\n`);
    });
  }

  const letter = (lang: Lang, to: string, write: () => { subject: string; text: string }): Promise<void> =>
    mailer.configured
      ? inLanguage(lang, async () => {
          const { subject, text } = write();
          await mailer.send(to, subject, text);
        }).catch((err) => {
          process.stderr.write(`site: a letter was not sent: ${err instanceof Error ? err.message : String(err)}\n`);
        })
      : Promise.resolve();

  function cookie(value: string, days = SESSION_DAYS): string {
    return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${days * 86_400}${origin.startsWith("https:") ? "; Secure" : ""}`;
  }

  /** A session token: when it ends, signed. */
  function session(): string {
    const until = String(Math.floor(Date.now() / 1000) + SESSION_DAYS * 86_400);
    return `${until}.${sign(until)}`;
  }

  function sessionValid(token: string): boolean {
    const dot = token.indexOf(".");
    if (dot < 1) return false;
    const until = token.slice(0, dot);
    if (!/^\d+$/.test(until) || Number(until) * 1000 < Date.now()) return false;
    return same(sign(until), token.slice(dot + 1));
  }

  const sign = (value: string): string => createHmac("sha256", secret).update(`session:${value}`).digest("base64url");
  const same = (a: string, b: string): boolean => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

  function announcement(body: Record<string, unknown>): Omit<Announcement, "id" | "createdAt"> & { id?: string } {
    const title = text(body.title, LIMITS.title);
    const kind = KINDS.find((one) => one === body.kind);
    const startsAt = new Date(String(body.startsAt ?? ""));
    if (!kind || title.length < 3) throw new Refused(400, "bad_announcement");
    const rawEnd = body.endsAt;
    const endsAt = typeof rawEnd === "string" && rawEnd ? new Date(rawEnd) : null;
    if (Number.isNaN(startsAt.getTime()) || (endsAt && Number.isNaN(endsAt.getTime()))) throw new Refused(400, "bad_announcement");
    const link = text(body.link, 500);
    return {
      id: typeof body.id === "string" && body.id ? text(body.id, 64) : undefined,
      kind,
      title,
      body: typeof body.body === "string" ? body.body.slice(0, LIMITS.announcement) : "",
      link: link.startsWith("/") || /^https?:\/\//.test(link) ? link : "",
      startsAt: startsAt.toISOString(),
      endsAt: endsAt ? endsAt.toISOString() : null,
      published: body.published === true,
    };
  }

  let liveCache: { at: number; list: unknown[] } | null = null;
  /** What the pages may show now: published, started, not ended. Read twenty times a minute at most. */
  async function live(): Promise<unknown[]> {
    if (liveCache && Date.now() - liveCache.at < 20_000) return liveCache.list;
    const now = Date.now();
    const list = (await store.announcements())
      .filter((a) => a.published && Date.parse(a.startsAt) <= now && (!a.endsAt || Date.parse(a.endsAt) > now))
      .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))
      .map(({ id, kind, title, body, link, endsAt }) => ({ id, kind, title, body, link, endsAt }));
    liveCache = { at: now, list };
    return list;
  }

  async function takeEmailToken(token: string): Promise<{ thread: string; email: string } | null> {
    const hash = /^[a-f0-9]{32}$/.test(token) ? hashOf(token) : "";
    const got: { value: { thread: string; email: string } | null } = { value: null };
    await changeList<{ hash: string; thread: string; email: string; expiresAt: string }>(dataDir, "email-tokens.json", (all) => {
      const now = Date.now();
      const at = all.findIndex((one) => one.hash === hash && Date.parse(one.expiresAt) > now);
      if (at < 0) return;
      got.value = { thread: all[at].thread, email: all[at].email };
      all.splice(at, 1);
    });
    const found = got.value;
    if (found) await store.changeThread(found.thread, (one) => {
      one.email = found.email;
    });
    return found;
  }

  async function takeLoginToken(token: string): Promise<boolean> {
    const hash = /^[a-f0-9]{48}$/.test(token) ? hashOf(token) : "";
    let good = false;
    await changeList<{ hash: string; expiresAt: string }>(dataDir, "login-tokens.json", (all) => {
      const now = Date.now();
      // The stale go first, whatever came of this one: their places would move.
      for (let i = all.length - 1; i >= 0; i--) if (Date.parse(all[i].expiresAt) <= now) all.splice(i, 1);
      const at = all.findIndex((one) => one.hash === hash);
      if (at >= 0) {
        good = true;
        all.splice(at, 1);
      }
    });
    return good;
  }

  const port = await listen(server, opts.port ?? SITE_PORT, opts.host ?? "127.0.0.1");
  const origin = (opts.origin ?? process.env.MOZG_SITE_ORIGIN ?? `http://127.0.0.1:${port}`).replace(/\/$/, "");
  const allowed = new Set([origin, ...(opts.origins ?? process.env.MOZG_SITE_ORIGIN?.split(",") ?? []), ...(dev ? [`http://localhost:3320`, `http://127.0.0.1:3320`, `http://127.0.0.1:${port}`] : [])].map((one) => one.trim().replace(/\/$/, "")));

  return {
    url: `${origin}/`,
    port,
    origin,
    close: () =>
      new Promise<void>((done) => {
        server.closeAllConnections?.();
        server.close(() => done());
      }),
  };
}

/**
 * A link that opens the panel, made on the server itself: the way in when
 * mail cannot be sent. It holds fifteen minutes and works once, like the one
 * from a letter. Run it with the same data folder as the running server:
 *
 *   node dist/site-server.mjs token
 */
export async function makeLoginLink(dataDir: string, origin: string, minutes = LOGIN_MINUTES): Promise<string> {
  await mkdir(dataDir, { recursive: true });
  const token = newId(24);
  await changeList<{ hash: string; expiresAt: string }>(dataDir, "login-tokens.json", (all) => {
    all.push({ hash: hashOf(token), expiresAt: new Date(Date.now() + minutes * 60_000).toISOString() });
  });
  return `${origin.replace(/\/$/, "")}/api/operator/login/${token}`;
}

async function changeList<T>(dir: string, name: string, change: (list: T[]) => void): Promise<void> {
  await withLock(dir, async () => {
    const file = join(dir, name);
    let list: T[] = [];
    try {
      const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
      if (Array.isArray(parsed)) list = parsed as T[];
    } catch {
      /* not there yet */
    }
    change(list);
    await writeFile(`${file}.${process.pid}.tmp`, `${JSON.stringify(list)}\n`);
    await rename(`${file}.${process.pid}.tmp`, file);
  });
}

/** Counts per key in a window. In memory: a restart forgets every count. */
class Buckets {
  private hits = new Map<string, number[]>();

  allow(key: string, limit: number, windowMs: number): boolean {
    if (this.hits.size > 20_000) this.prune(windowMs);
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < windowMs);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  private prune(windowMs: number): void {
    const now = Date.now();
    for (const [key, ats] of this.hits) {
      const recent = ats.filter((at) => now - at < windowMs);
      if (recent.length) this.hits.set(key, recent);
      else this.hits.delete(key);
    }
  }
}

function listen(server: Server, port: number, host: string): Promise<number> {
  return new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(port, host, () => {
      server.off("error", fail);
      done((server.address() as AddressInfo).port);
    });
  });
}

/** The Origin of a write has to be the site's own: which origin was asked is on the request. */
function cookieOf(header: string): string {
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return decodeURIComponent(rest.join("="));
  }
  return "";
}

/** A sentence as a person typed it: line breaks kept, the edges trimmed, no longer than the limit. */
function message(value: unknown): string {
  const body = typeof value === "string" ? value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, LIMITS.body) : "";
  if (!body) throw new Refused(400, "empty");
  return body;
}

/** A word or a line: whitespace folded, no longer than the limit. */
function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

async function readJson(req: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) throw new Refused(415, "json_only");
  const body = await new Promise<string | null>((done) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    req.on("data", (chunk: Buffer) => {
      // Past the limit the rest is drained, not kept: it is already not a message.
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
  if (body === null) throw new Refused(413, "too_large");
  try {
    const value = JSON.parse(body) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("shape");
    return value as Record<string, unknown>;
  } catch {
    throw new Refused(400, "bad_json");
  }
}

/** Someone's browser extension throwing inside the page: the top frame is a bundle that is not shipped. */
function fromExtension(stack: unknown): boolean {
  const top = typeof stack === "string" ? stack.split("\n").find((line) => line.includes("://")) : undefined;
  return Boolean(top && /\w+-extension:\/\//.test(top));
}

/** Script the browser itself injected, or a cross-origin "Script error." with the details hidden. */
function fromHostScript(message: string): boolean {
  return message === "Script error." || /\b(ethereum|__firefox__|__gCrWeb|webkit\.messageHandlers)\b/.test(message);
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

function plain(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}
