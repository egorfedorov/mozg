import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VERSION } from "@/core/version";
import { Store } from "@/core/store";
import { DEFAULT_SETTINGS } from "@/core/store";
import { deskAlive, ensureDesk, pluginInfo, startDesk } from "./desk";

async function get(url: string, init?: RequestInit) {
  try {
    return await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(4000) });
  } catch (err) {
    throw new Error(`no answer from ${url}: ${err instanceof Error ? err.message : err}`);
  }
}

test("the desk answers health, state, and nothing it should not", async () => {
  const desk = await startDesk({ sample: true, port: 0 });
  try {
    const base = `http://127.0.0.1:${desk.port}`;

    const health = await (await get(`${base}/api/health`)).json();
    assert.deepEqual(health, { ok: true, version: VERSION, pid: process.pid, sample: true });

    const state = await (await get(`${base}/api/state`)).json();
    assert.equal(state.today.ownership, 48);
    assert.equal(state.project, "/Users/ada/forge");

    assert.equal((await get(`${base}/api/nope`)).status, 404);
    assert.equal((await get(`${base}/desk/`, { method: "POST" })).status, 405);

    // Only the loopback interface: the desk is on 127.0.0.1, never on the network.
    assert.match(desk.url, /^http:\/\/127\.0\.0\.1:\d+\/desk\/$/);
  } finally {
    await desk.close();
  }
});

test("a local page may read the numbers; any other page may not", async () => {
  const desk = await startDesk({ sample: true, port: 0 });
  try {
    const base = `http://127.0.0.1:${desk.port}`;
    const dev = await get(`${base}/api/state`, { headers: { Origin: "http://localhost:3320" } });
    assert.equal(dev.headers.get("access-control-allow-origin"), "http://localhost:3320");
    const elsewhere = await get(`${base}/api/state`, { headers: { Origin: "https://example.com" } });
    assert.equal(elsewhere.headers.get("access-control-allow-origin"), null);
  } finally {
    await desk.close();
  }
});

test("a real desk with nothing recorded says so", async () => {
  const desk = await startDesk({ port: 0, storeDir: await mkdtemp(join(tmpdir(), "mozg-desk-empty-")), staticDir: null });
  try {
    const base = `http://127.0.0.1:${desk.port}`;
    const state = await (await get(`${base}/api/state`)).json();
    assert.equal(state.project, null);
    assert.equal(state.today.ownership, null);
    assert.equal(state.changes === undefined, true);
    const page = await get(`${base}/desk/`);
    assert.equal(page.status, 501);
    assert.match(await page.text(), /development/);
  } finally {
    await desk.close();
  }
});

test("the packed page and its assets are served, and nothing outside them", async () => {
  const root = await mkdtemp(join(tmpdir(), "mozg-desk-static-"));
  await mkdir(join(root, "desk"), { recursive: true });
  await mkdir(join(root, "_next", "static"), { recursive: true });
  await mkdir(join(root, "fonts"), { recursive: true });
  await writeFile(join(root, "desk", "index.html"), "<html>desk</html>");
  await writeFile(join(root, "_next", "static", "chunk.js"), "console.log(1)");
  await writeFile(join(root, "fonts", "x.woff2"), "font");
  const outside = await mkdtemp(join(tmpdir(), "mozg-desk-outside-"));
  await writeFile(join(outside, "secret.txt"), "no");

  const desk = await startDesk({ sample: true, port: 0, staticDir: root });
  try {
    const base = `http://127.0.0.1:${desk.port}`;
    assert.equal((await get(`${base}/`)).status, 308);
    assert.equal((await get(`${base}/`)).headers.get("location"), "/desk/");
    const page = await get(`${base}/desk/`);
    assert.equal(await page.text(), "<html>desk</html>");
    assert.match(page.headers.get("content-type") ?? "", /text\/html/);
    assert.equal(page.headers.get("cache-control"), "no-cache");

    const chunk = await get(`${base}/_next/static/chunk.js`);
    assert.equal(await chunk.text(), "console.log(1)");
    assert.match(chunk.headers.get("cache-control") ?? "", /immutable/);
    assert.equal((await get(`${base}/fonts/x.woff2`)).status, 200);

    const head = await get(`${base}/desk/`, { method: "HEAD" });
    assert.equal(head.status, 200);

    assert.equal((await get(`${base}/desk/..%2F..%2F..%2F${outside.split("/").pop()}%2Fsecret.txt`)).status, 404);
    assert.equal((await get(`${base}/elsewhere`)).status, 404);
  } finally {
    await desk.close();
  }
});

test("one desk per machine: the second call finds the first", async () => {
  const record = join(await mkdtemp(join(tmpdir(), "mozg-desk-record-")), "desk.json");
  const first = await ensureDesk({ sample: true, port: 0, record });
  try {
    const saved = JSON.parse(await readFile(record, "utf8"));
    assert.equal(saved.port, first.port);
    assert.equal(saved.pid, process.pid);
    assert.equal(await deskAlive(first.port), true);
    assert.equal(await deskAlive(1), false);

    const second = await ensureDesk({ sample: true, port: 0, record });
    assert.equal(second.url, first.url);
  } finally {
    await first.close();
  }
  // With the first one gone, a new one is started and written down.
  const third = await ensureDesk({ sample: true, port: 0, record });
  await third.close();
  assert.equal(JSON.parse(await readFile(record, "utf8")).port, third.port);
});

test("a taken port is not a failure: the desk moves to the next one", async () => {
  const first = await startDesk({ sample: true, port: 0 });
  try {
    const second = await startDesk({ sample: true, port: first.port });
    await second.close();
    assert.notEqual(second.port, first.port);
  } finally {
    await first.close();
  }
});

/** Node's fetch will not send a Host of one's choosing; http will. */
function getWithHost(url: string, host: string): Promise<{ status: number; body: string }> {
  return new Promise((done, reject) => {
    const req = httpRequest(url, { headers: { host } }, (res) => {
      let body = "";
      res.on("data", (c: Buffer) => (body += c.toString()));
      res.on("end", () => done({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("the desk says how it is attached, and only what a process wrote down", async () => {
  const storeDir = await mkdtemp(join(tmpdir(), "mozg-desk-conn-"));
  const logsDir = await mkdtemp(join(tmpdir(), "mozg-desk-logs-"));
  const desk = await startDesk({ port: 0, storeDir, logsDir, staticDir: null });
  try {
    const base = `http://127.0.0.1:${desk.port}`;
    const first = await (await get(`${base}/api/state`)).json();
    assert.deepEqual(first.settings, DEFAULT_SETTINGS);
    assert.equal(first.connection.version, VERSION);
    assert.equal(first.connection.logsDir, logsDir);
    assert.equal(first.connection.storeDir, storeDir);
    assert.deepEqual([first.connection.logs, first.connection.sessions, first.connection.changes, first.connection.explains], [0, 0, 0, 0]);
    assert.equal(first.connection.indexedAt, null);
    assert.deepEqual(first.connection.pulses, { mcpStarted: null, mcpCalled: null, sessionStart: null });

    // Another process notes that the agent called: the desk shows it.
    await (await Store.open(storeDir)).touch("mcpCalled", "2026-11-25T12:00:00.000Z");
    const second = await (await get(`${base}/api/state`)).json();
    assert.equal(second.connection.pulses.mcpCalled, "2026-11-25T12:00:00.000Z");

    // The sample is built from nothing and reads nobody's folder.
    const sample = await startDesk({ sample: true, port: 0 });
    try {
      const state = await (await get(`http://127.0.0.1:${sample.port}/api/state`)).json();
      assert.equal(state.connection, undefined);
      assert.equal(state.settings, undefined);
    } finally {
      await sample.close();
    }
  } finally {
    await desk.close();
  }
});

test("the settings are written when they are the settings, and then they are in force", async () => {
  const storeDir = await mkdtemp(join(tmpdir(), "mozg-desk-set-"));
  const desk = await startDesk({ port: 0, storeDir, staticDir: null });
  const post = (body: string, headers: Record<string, string> = {}) =>
    get(`http://127.0.0.1:${desk.port}/api/settings`, { method: "POST", body, headers: { "Content-Type": "application/json", ...headers } });
  try {
    const ok = await post(JSON.stringify({ nudge: "firm" }), { Origin: "http://localhost:3320" });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("access-control-allow-origin"), "http://localhost:3320");
    assert.deepEqual(await ok.json(), { settings: { nudge: "firm", asks: true, language: "system", hidden: [] } });
    const gate = await post(JSON.stringify({ asks: false }));
    assert.equal(gate.status, 200);
    assert.deepEqual((await gate.json()).settings, { nudge: "firm", asks: false, language: "system", hidden: [] }, "a field left out keeps its value");
    assert.equal((await (await get(`http://127.0.0.1:${desk.port}/api/state`)).json()).settings.nudge, "firm");
    assert.deepEqual((await Store.open(storeDir)).settings, { nudge: "firm", asks: false, language: "system", hidden: [] }, "and on disk, for the hooks to read");

    // A local page asks before it sends: the answer says it may.
    const preflight = await get(`http://127.0.0.1:${desk.port}/api/settings`, { method: "OPTIONS", headers: { Origin: "http://127.0.0.1:3320", "Access-Control-Request-Method": "POST" } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "http://127.0.0.1:3320");
    assert.match(preflight.headers.get("access-control-allow-methods") ?? "", /POST/);

    // Everything that is not a local page sending the settings.
    const refused = [
      [`a page on another site`, { Origin: "https://example.com" }, JSON.stringify({ nudge: "off" }), 403],
      [`a form, which is all another site can make a browser post`, { Origin: "http://localhost:3320", "Content-Type": "application/x-www-form-urlencoded" }, "nudge=off", 415],
      [`a value a setting cannot hold`, { Origin: "http://localhost:3320" }, JSON.stringify({ nudge: "loud" }), 400],
      [`something that is not the settings`, { Origin: "http://localhost:3320" }, JSON.stringify({ theme: "dark" }), 400],
      [`not JSON at all`, { Origin: "http://localhost:3320" }, "{nope", 400],
      [`too much to be the settings`, { Origin: "http://localhost:3320" }, JSON.stringify({ hidden: Array.from({ length: 400 }, (_, i) => `/${"x".repeat(30)}${i}`) }), 413],
    ] as const;
    for (const [what, headers, body, status] of refused) {
      const res = await post(body, headers);
      assert.equal(res.status, status, what);
    }
    // None of it was written.
    assert.equal((await Store.open(storeDir)).settings.nudge, "firm");
    assert.equal((await post(JSON.stringify({ asks: "yes" })).then((r) => r.status)), 400, "the gate is on or off, nothing else");

    // Writing anywhere else is not a thing.
    assert.equal((await get(`http://127.0.0.1:${desk.port}/api/nope`, { method: "POST", body: "{}" })).status, 404);
    assert.equal((await get(`http://127.0.0.1:${desk.port}/desk/`, { method: "POST" })).status, 405);
  } finally {
    await desk.close();
  }
});

test("the sample desk is read-only", async () => {
  const desk = await startDesk({ sample: true, port: 0 });
  try {
    const res = await get(`http://127.0.0.1:${desk.port}/api/settings`, { method: "POST", body: JSON.stringify({ nudge: "off" }), headers: { "Content-Type": "application/json" } });
    assert.equal(res.status, 403);
  } finally {
    await desk.close();
  }
});

test("a name that is not this machine is refused, so a rebound domain sees nothing", async () => {
  const desk = await startDesk({ sample: true, port: 0 });
  try {
    const base = `http://127.0.0.1:${desk.port}`;
    assert.equal((await getWithHost(`${base}/api/state`, "evil.example")).status, 403);
    assert.equal((await getWithHost(`${base}/api/health`, "mozg.sh:4317")).status, 403);
    // And a request that names no host at all, the way HTTP/1.0 asks.
    const bare = await new Promise<string>((done, reject) => {
      const socket = connect(desk.port, "127.0.0.1", () => socket.write("GET /api/health HTTP/1.0\r\n\r\n"));
      let text = "";
      socket.on("data", (c: Buffer) => (text += c.toString()));
      socket.on("end", () => done(text));
      socket.on("error", reject);
    });
    assert.match(bare, /^HTTP\/1\.1 403/);
    for (const own of ["127.0.0.1", "localhost", "[::1]"]) {
      assert.equal((await getWithHost(`${base}/api/health`, `${own}:${desk.port}`)).status, 200, own);
    }
  } finally {
    await desk.close();
  }
});

test("packed into a plugin the desk knows its name; from source it says so", () => {
  // This file runs from source, where there is no manifest one folder up.
  assert.equal(pluginInfo(), null);
});
