import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { VERSION } from "@/core/version";
import { letterbox } from "./mail";
import { startSite, type SiteOptions } from "./site";

/**
 * The site's server, on a port the system picks and with a data folder made
 * for the test. No test reaches the real ~/.mozg-site: every one names its own
 * folder before anything else.
 */

const ORIGIN = "https://mozg.test";
const OPERATOR = "Operator@mozg.test";
const loginLink = /https:\/\/mozg\.test\/api\/operator\/login\/([a-f0-9]{48})/;

async function start(extra: Partial<SiteOptions> = {}, pages = false) {
  const dir = await mkdtemp(join(tmpdir(), "mozg-site-test-"));
  const staticDir = pages ? join(dir, "pages") : null;
  if (staticDir) {
    await mkdir(join(staticDir, "admin"), { recursive: true });
    await writeFile(join(staticDir, "index.html"), "<h1>the site</h1>");
    await writeFile(join(staticDir, "admin", "index.html"), "<h1>operator</h1>");
    await writeFile(join(staticDir, "404.html"), "<h1>lost</h1>");
    await writeFile(join(staticDir, "secret.txt"), "not a page");
  }
  const mail = letterbox(() => {});
  const site = await startSite({ port: 0, dataDir: dir, staticDir, origin: ORIGIN, origins: [ORIGIN], operatorEmail: OPERATOR, secret: "a-secret-for-tests", mailer: mail, ...extra });
  const base = `http://127.0.0.1:${site.port}`;

  /** A call as the site's own page makes it, unless told otherwise. */
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { Origin: ORIGIN, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    const text = await res.text();
    // The body as JSON when it is JSON; the answers of the server always are.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let json: Record<string, any> = {};
    try {
      json = JSON.parse(text);
    } catch {
      /* a page, or plain text */
    }
    return { status: res.status, headers: res.headers, text, json };
  };

  /** Opens the panel the way the operator does: asks for the link, follows it, keeps the cookie. */
  const login = async (): Promise<Record<string, string>> => {
    await call("POST", "/api/operator/login", { email: OPERATOR });
    const link = mail.sent[mail.sent.length - 1].text.match(loginLink)?.[1];
    assert.ok(link, "the letter carries the link");
    const res = await fetch(`${base}/api/operator/login/${link}`, { redirect: "manual" });
    assert.equal(res.status, 303);
    const cookie = res.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie, "arriving by the link sets the session");
    return { Cookie: cookie };
  };

  /** A request with the path exactly as given. */
  const raw = (path: string) =>
    new Promise<{ status: number }>((done, fail) => {
      const req = httpRequest({ host: "127.0.0.1", port: site.port, path, method: "GET" }, (res) => {
        res.resume();
        res.on("end", () => done({ status: res.statusCode ?? 0 }));
      });
      req.on("error", fail);
      req.end();
    });

  return { site, base, dir, mail, call, raw, login, close: async () => { await site.close(); await rm(dir, { recursive: true, force: true }); } };
}

const openThread = async (call: Awaited<ReturnType<typeof start>>["call"]) => {
  const made = await call("POST", "/api/chat/threads", { lang: "de", page: "/de/" });
  assert.equal(made.json.ok, true);
  return { id: made.json.id as string, key: made.json.key as string, auth: { Authorization: `Bearer ${made.json.key}` } };
};

test("the site's server says it is up, and tells nobody more", async () => {
  const s = await start();
  try {
    const res = await s.call("GET", "/api/health");
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { ok: true, version: VERSION });
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  } finally {
    await s.close();
  }
});

test("a write from anywhere but the site's own page is not served", async () => {
  const s = await start();
  try {
    assert.equal((await s.call("POST", "/api/chat/threads", {}, { Origin: "" })).status, 403);
    assert.equal((await s.call("POST", "/api/chat/threads", {}, { Origin: "https://evil.test" })).status, 403);
    assert.equal((await s.call("GET", "/api/health", undefined, { Origin: "https://evil.test" })).status, 403);
    // A page of the site is answered, and only it is allowed to read the answer.
    const good = await s.call("POST", "/api/chat/threads", { lang: "en" });
    assert.equal(good.status, 200);
    assert.equal(good.headers.get("access-control-allow-origin"), ORIGIN);
  } finally {
    await s.close();
  }
});

test("a body that is not JSON, or too large, is refused before it is read as one", async () => {
  const s = await start();
  try {
    assert.equal((await s.call("POST", "/api/chat/threads", "{not json")).status, 400);
    assert.equal((await s.call("POST", "/api/chat/threads", "{}", { "Content-Type": "text/plain" })).status, 415);
    assert.equal((await s.call("POST", "/api/chat/threads", { page: "x".repeat(9000) })).status, 413);
    // Past the login the panel's calls need its session, before anything else is said.
    assert.equal((await s.call("GET", "/api/operator/nothing")).status, 401);
  } finally {
    await s.close();
  }
});

test("a thread opens with a secret only the browser keeps, and a wrong secret learns nothing", async () => {
  const s = await start();
  try {
    const thread = await openThread(s.call);
    assert.ok(thread.id && thread.key.length >= 40);
    const read = await s.call("GET", `/api/chat/threads/${thread.id}`, undefined, thread.auth);
    assert.equal(read.json.ok, true);
    assert.equal(read.json.thread.lang, "de");
    assert.equal("key" in read.json.thread, false, "the hash of the key never leaves");
    assert.equal((await s.call("GET", `/api/chat/threads/${thread.id}`, undefined, { Authorization: "Bearer wrong" })).status, 404);
    assert.equal((await s.call("GET", `/api/chat/threads/${thread.id}`)).status, 404);
    assert.equal((await s.call("GET", "/api/chat/threads/..%2F..%2Fetc")).status, 404);
  } finally {
    await s.close();
  }
});

test("threads cannot be opened by the hundred from one address", async () => {
  const s = await start();
  try {
    for (let i = 0; i < 5; i++) assert.equal((await s.call("POST", "/api/chat/threads", { lang: "en" })).status, 200);
    assert.equal((await s.call("POST", "/api/chat/threads", { lang: "en" })).status, 429);
  } finally {
    await s.close();
  }
});

test("a message is kept as typed, waits its turn, and tells the operator", async () => {
  const s = await start();
  try {
    const thread = await openThread(s.call);
    assert.equal((await s.call("POST", `/api/chat/threads/${thread.id}/messages`, { body: "   " }, thread.auth)).status, 400);
    const said = await s.call("POST", `/api/chat/threads/${thread.id}/messages`, { body: "  The desk\nshows nothing.  " }, thread.auth);
    assert.equal(said.json.message.body, "The desk\nshows nothing.");
    assert.equal((await s.call("POST", `/api/chat/threads/${thread.id}/messages`, { body: "again" }, thread.auth)).status, 429);
    // Four thousand characters is the most that is kept; the rest is cut, not refused.
    // (In a thread of its own: the first is still waiting out its fifteen seconds.)
    const other = await openThread(s.call);
    const long = await s.call("POST", `/api/chat/threads/${other.id}/messages`, { body: "x".repeat(24_000) }, other.auth);
    assert.equal(long.status, 200);
    assert.equal(long.json.message.body.length, 4000);
    // A body over its route's limit is refused whole: twenty-four kilobytes is not a message.
    const big = await openThread(s.call);
    assert.equal((await s.call("POST", `/api/chat/threads/${big.id}/messages`, { body: "y".repeat(30_000) }, big.auth)).status, 413);
    // A letter for each thread's first message: two threads wrote.
    assert.equal(s.mail.sent.length, 2);
    assert.equal(s.mail.sent[0].to, OPERATOR.toLowerCase());
    assert.match(s.mail.sent[0].text, /The desk/);
    assert.match(s.mail.sent[0].text, /https:\/\/mozg\.test\/admin\/#chat/);
    // The trap for machines: answered like a message, filed nowhere.
    const trap = await s.call("POST", `/api/chat/threads/${thread.id}/messages`, { body: "buy now", website: "http://spam" }, thread.auth);
    assert.equal(trap.json.ok, true);
    const operator = await s.login();
    const listed = await s.call("GET", "/api/operator/threads", undefined, operator);
    assert.equal(listed.json.threads.length, 3);
    const first = listed.json.threads.find((one: { id: string }) => one.id === thread.id);
    assert.equal(first.messages.length, 1, "the trapped message was filed nowhere");
    assert.equal(first.waiting, 1);
  } finally {
    await s.close();
  }
});

test("the panel opens for one address, by one link, once", async () => {
  const s = await start();
  try {
    assert.equal((await s.call("GET", "/api/operator/threads")).status, 401);
    // Another address: the same answer, and no letter.
    const other = await s.call("POST", "/api/operator/login", { email: "nobody@mozg.test" });
    assert.deepEqual(other.json, { ok: true });
    assert.equal(s.mail.sent.length, 0);
    // The operator's, in any case.
    const asked = await s.call("POST", "/api/operator/login", { email: "OPERATOR@mozg.test" });
    assert.deepEqual(asked.json, { ok: true });
    assert.equal(s.mail.sent.length, 1);
    const link = s.mail.sent[0].text.match(loginLink)![1];
    const first = await fetch(`${s.base}/api/operator/login/${link}`, { redirect: "manual" });
    assert.equal(first.status, 303);
    assert.equal(first.headers.get("location"), `${ORIGIN}/admin/`);
    const cookie = first.headers.get("set-cookie")!;
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Secure/);
    const again = await fetch(`${s.base}/api/operator/login/${link}`, { redirect: "manual" });
    assert.equal(again.status, 400);
    const forged = await s.call("GET", "/api/operator/threads", undefined, { Cookie: "mozg_operator=9999999999.forged" });
    assert.equal(forged.status, 401);
    const inside = await s.call("GET", "/api/operator/threads", undefined, { Cookie: cookie.split(";")[0] });
    assert.equal(inside.json.ok, true);
    for (let i = 0; i < 4; i++) await s.call("POST", "/api/operator/login", { email: OPERATOR });
    const limited = await s.call("POST", "/api/operator/login", { email: OPERATOR });
    assert.deepEqual(limited.json, { ok: true });
    // Five questions an hour from one address, whoever they name; four named the operator.
    assert.equal(s.mail.sent.length, 4);
  } finally {
    await s.close();
  }
});

test("a reply reaches the thread, and by mail when the visitor asked for it", async () => {
  const s = await start();
  try {
    const thread = await openThread(s.call);
    await s.call("POST", `/api/chat/threads/${thread.id}/messages`, { body: "Where is the desk?" }, thread.auth);
    await s.call("POST", `/api/chat/threads/${thread.id}/email`, { email: "not-an-address" }, thread.auth);
    await s.call("POST", `/api/chat/threads/${thread.id}/email`, { email: "Ada@Example.test" }, thread.auth);
    // One letter to the operator, one to confirm the address: the bad one was not told apart.
    assert.equal(s.mail.sent.length, 2);
    const confirm = s.mail.sent[1].text.match(/https:\/\/mozg\.test\/api\/chat\/email\/([a-f0-9]{32})/)![1];
    const operator = await s.login();
    const reply = await s.call("POST", `/api/operator/threads/${thread.id}/reply`, { body: "On 127.0.0.1:4317." }, operator);
    assert.equal(reply.json.message.author, "operator");
    // Not confirmed yet: the reply is not mailed.
    assert.equal(s.mail.sent.length, 3);
    const confirmed = await fetch(`${s.base}/api/chat/email/${confirm}`, { redirect: "manual" });
    assert.equal(confirmed.status, 303);
    assert.match(confirmed.headers.get("location") ?? "", new RegExp(`^https://mozg\\.test/\\?chat=${thread.id}&k=[a-f0-9]{64}#chat$`));
    await s.call("POST", `/api/operator/threads/${thread.id}/reply`, { body: "And by mail now." }, operator);
    const mailed = s.mail.sent[s.mail.sent.length - 1];
    assert.equal(mailed.to, "ada@example.test");
    assert.match(mailed.text, /And by mail now\./);
    // The link in that letter opens the thread from another device.
    const k = mailed.text.match(/k=([a-f0-9]{64})/)![1];
    const read = await s.call("GET", `/api/chat/threads/${thread.id}`, undefined, { Authorization: `Bearer ${k}` });
    assert.equal(read.json.thread.messages.length, 3);
    assert.equal((await s.call("GET", `/api/chat/threads/${thread.id}`, undefined, thread.auth)).json.thread.email, "ada@example.test");
    // Reading the thread is the operator reading it: nothing waits after.
    await s.call("GET", `/api/operator/threads/${thread.id}`, undefined, operator);
    assert.equal((await s.call("GET", "/api/operator/threads", undefined, operator)).json.threads[0].waiting, 0);
    assert.equal((await s.call("DELETE", `/api/operator/threads/${thread.id}`, undefined, operator)).json.ok, true);
    assert.equal((await s.call("GET", `/api/operator/threads`, undefined, operator)).json.threads.length, 0);
  } finally {
    await s.close();
  }
});

test("errors are counted, not piled up, and noise from extensions is dropped", async () => {
  const s = await start();
  try {
    const report = (message: string, stack = "") => s.call("POST", "/api/report", { message, stack, url: "/de/" });
    await report("Cannot read properties of undefined", "TypeError\n    at x (https://mozg.sh/_next/static/chunks/a.js:1:1)");
    await report("Cannot read properties of undefined");
    await report("window.ethereum is not defined");
    await report("Script error.");
    await report("boom", "Error\n    at f (chrome-extension://abc/inject.js:1:2)");
    await report("");
    const operator = await s.login();
    const errors = (await s.call("GET", "/api/operator/errors", undefined, operator)).json.errors;
    assert.equal(errors.length, 1);
    assert.equal(errors[0].count, 2);
    assert.equal(errors[0].url, "/de/");
    assert.equal((await s.call("POST", "/api/operator/errors/resolve", { id: errors[0].id }, operator)).json.ok, true);
    assert.ok((await s.call("GET", "/api/operator/errors", undefined, operator)).json.errors[0].resolvedAt);
    const overview = await s.call("GET", "/api/operator/overview", undefined, operator);
    assert.equal(overview.json.errors.open, 0);
    assert.equal(overview.json.mail, true);
  } finally {
    await s.close();
  }
});

test("announcements reach the pages only while they are live", async () => {
  const s = await start();
  try {
    assert.deepEqual((await s.call("GET", "/api/announcements")).json, { ok: true, announcements: [] });
    const operator = await s.login();
    const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
    const post = (body: Record<string, unknown>) => s.call("POST", "/api/operator/announcements", body, operator);
    assert.equal((await post({ kind: "news", title: "x" })).status, 400);
    const live = (await post({ kind: "news", title: "Launch week", body: "All of Pro is free this week.", link: "/changelog/", startsAt: at(-1), endsAt: at(60), published: true })).json.announcement;
    await post({ kind: "notice", title: "Later", startsAt: at(30), published: true });
    await post({ kind: "maintenance", title: " javascript:alert(1)", link: "javascript:alert(1)", startsAt: at(-1), published: true });
    const shown = (await s.call("GET", "/api/announcements")).json.announcements;
    assert.equal(shown.length, 2, "the one that starts later is not on the pages yet");
    assert.equal(shown.find((one: { kind: string }) => one.kind === "news").title, "Launch week");
    // A link that is not an address of this site or an http(s) one is dropped, not kept.
    assert.equal(shown.find((one: { kind: string }) => one.kind === "maintenance").link, "");
    assert.equal((await s.call("POST", "/api/operator/announcements/retire", { id: live.id }, operator)).json.ok, true);
    // The operator's change is on the pages at once; the copy is only for reads in between.
    assert.deepEqual((await s.call("GET", "/api/announcements")).json.announcements.map((one: { kind: string }) => one.kind), ["maintenance"]);
  } finally {
    await s.close();
  }
});

test("drafts are kept, and everything can be taken out as one file", async () => {
  const s = await start();
  try {
    const operator = await s.login();
    const thread = await openThread(s.call);
    await s.call("POST", `/api/chat/threads/${thread.id}/messages`, { body: "hello" }, thread.auth);
    const draft = (await s.call("PUT", "/api/operator/drafts", { channel: "x", title: "Launch", body: "Own what your AI writes." }, operator)).json.draft;
    assert.equal((await s.call("GET", "/api/operator/drafts", undefined, operator)).json.drafts[0].title, "Launch");
    const again = (await s.call("PUT", "/api/operator/drafts", { ...draft, body: "Changed." }, operator)).json.draft;
    assert.equal(again.id, draft.id);
    assert.equal((await s.call("GET", "/api/operator/drafts", undefined, operator)).json.drafts.length, 1);
    const all = (await s.call("GET", "/api/operator/export", undefined, operator)).json;
    assert.equal(all.threads.length, 1);
    assert.equal("key" in all.threads[0], false);
    assert.equal(all.drafts[0].body, "Changed.");
    assert.equal((await s.call("GET", "/api/operator/export")).status, 401);
  } finally {
    await s.close();
  }
});

test("the pages are served from the folder, the panel is framed by nobody, and nothing outside it is", async () => {
  const s = await start({}, true);
  try {
    const get = async (path: string) => {
      const res = await fetch(`${s.base}${path}`, { redirect: "manual" });
      return { status: res.status, type: res.headers.get("content-type"), frame: res.headers.get("x-frame-options"), robots: res.headers.get("x-robots-tag"), text: await res.text() };
    };
    const home = await get("/");
    assert.equal(home.status, 200);
    assert.match(home.type!, /text\/html/);
    assert.equal(home.frame, null);
    const admin = await get("/admin/");
    assert.equal(admin.status, 200);
    assert.equal(admin.frame, "DENY");
    assert.equal(admin.robots, "noindex, nofollow");
    assert.match(admin.text, /operator/);
    assert.equal((await get("/admin")).status, 200);
    assert.equal((await get("/nowhere-at-all")).status, 404);
    // Asked for raw, the way no browser would, with the slashes hidden so that
    // nothing tidies the address first: a step outside the folder is nowhere.
    for (const path of ["/..%2f..%2fetc/passwd", "/%2e%2e%2f%2e%2e%2fsecret.txt", "/admin/..%2f..%2fsecret.txt"]) {
      assert.equal((await s.raw(path)).status, 404, path);
    }
    assert.equal((await get("/secret.txt")).status, 200);
  } finally {
    await s.close();
  }
});

test("without mail the chat still works, and the way into the panel is the token command", async () => {
  const s = await start({ mailer: { configured: false, send: async () => { throw new Error("no mail"); } } });
  try {
    const thread = await openThread(s.call);
    assert.equal((await s.call("POST", `/api/chat/threads/${thread.id}/messages`, { body: "nobody will be told" }, thread.auth)).status, 200);
    const asked = await s.call("POST", "/api/operator/login", { email: OPERATOR });
    assert.equal("link" in asked.json, false);
  } finally {
    await s.close();
  }
});

test("a server without a secret refuses to start, rather than sign with nothing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mozg-site-test-"));
  try {
    await assert.rejects(startSite({ port: 0, dataDir: dir, secret: "" }), /MOZG_SECRET/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
