/**
 * Headless renderer for docs sites that ship a JavaScript shell.
 *
 *   POST /render {"url": "..."} -> {"html": "...", "status": 200}
 *   GET  /health                -> {"ok": true}
 *
 * One persistent Chromium, one page per request. The service lives on its own
 * docker network and is reached only via a localhost-published port — it must
 * NOT share a network with the database. Defence in depth on top of that:
 * requests to private address literals are blocked at the browser level, and
 * the caller is expected to run the same DNS-resolving URL guard the rest of
 * the product uses before asking for a render.
 */
const http = require("node:http");
const { chromium } = require("playwright");

const PORT = process.env.PORT || 8100;
const PAGE_TIMEOUT = 30_000;

/** Private/link-local/metadata literals a page's subresources may not touch. */
function blockedHost(hostname) {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal")) return true;
  const m = h.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (h === "::" || h === "::1" || h.startsWith("fe80") || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("::ffff:")) return true;
  return false;
}

let browserPromise = null;
function getBrowser() {
  browserPromise ??= chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  return browserPromise;
}

async function render(url) {
  const target = new URL(url);
  if (!/^https?:$/.test(target.protocol)) throw new Error("only http(s)");
  if (blockedHost(target.hostname)) throw new Error("blocked host");

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: "mozg/0.1 render (+https://mozg.sh)",
    javaScriptEnabled: true,
  });
  try {
    await context.route("**/*", (route) => {
      try {
        const u = new URL(route.request().url());
        if (blockedHost(u.hostname)) return route.abort();
        // Text is all we keep; images and fonts are wasted bytes.
        const type = route.request().resourceType();
        if (type === "image" || type === "font" || type === "media") return route.abort();
        return route.continue();
      } catch {
        return route.abort();
      }
    });

    const page = await context.newPage();
    const res = await page.goto(url, { waitUntil: "networkidle", timeout: PAGE_TIMEOUT });
    // SPAs often settle a beat after networkidle.
    await page.waitForTimeout(500);
    const html = await page.content();
    return { html, status: res ? res.status() : 0 };
  } finally {
    await context.close();
  }
}

http
  .createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    }
    if (req.method !== "POST" || req.url !== "/render") {
      res.writeHead(404);
      return res.end();
    }
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 10_000) req.destroy();
    });
    req.on("end", async () => {
      try {
        const { url } = JSON.parse(body);
        const out = await render(String(url));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(out));
      } catch (err) {
        res.writeHead(422, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: String(err && err.message ? err.message : err) }));
      }
    });
  })
  .listen(PORT, () => console.log(`[render] listening on ${PORT}`));
