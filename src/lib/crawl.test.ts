// crawl -> page -> env, and env validates at import. Must be the first
// import — see the note inside.
import "./test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseGitHubUrl,
  parseSitemap,
  extractLinks,
  scopeOf,
  inScope,
  normalizeUrl,
  discoverPages,
  type Fetcher,
} from "./crawl";

// ─── github url parsing ──────────────────────────────────────────────────────

test("repository root", () => {
  assert.deepEqual(parseGitHubUrl("https://github.com/StakeEngine/docs"), {
    repo: "StakeEngine/docs",
    ref: "HEAD",
    path: "",
  });
});

test("tree URL keeps branch and directory", () => {
  assert.deepEqual(
    parseGitHubUrl("https://github.com/o/r/tree/main/src/routes/docs"),
    { repo: "o/r", ref: "main", path: "src/routes/docs/" },
  );
});

test("raw URL strips the file, keeps the directory", () => {
  assert.deepEqual(
    parseGitHubUrl("https://raw.githubusercontent.com/o/r/HEAD/docs/api/index.md"),
    { repo: "o/r", ref: "HEAD", path: "docs/api/" },
  );
});

test("non-github is not github", () => {
  assert.equal(parseGitHubUrl("https://stake-engine.com/docs"), null);
  assert.equal(parseGitHubUrl("not a url"), null);
});

// ─── sitemap parsing ─────────────────────────────────────────────────────────

test("sitemap locs and index detection", () => {
  const index = parseSitemap(
    `<sitemapindex><sitemap><loc> https://x.com/a.xml </loc></sitemap></sitemapindex>`,
  );
  assert.deepEqual(index, { locs: ["https://x.com/a.xml"], isIndex: true });

  const flat = parseSitemap(
    `<urlset><url><loc>https://x.com/docs/a</loc></url><url><loc>https://x.com/docs/b</loc></url></urlset>`,
  );
  assert.equal(flat.isIndex, false);
  assert.equal(flat.locs.length, 2);
});

test("a JS shell served as sitemap.xml yields no locs", () => {
  const shell = `<!doctype html><html><head><link href="/_app/x.js"></head></html>`;
  assert.deepEqual(parseSitemap(shell).locs, []);
});

// ─── scope and links ─────────────────────────────────────────────────────────

test("scope is the section, not the whole site", () => {
  const scope = scopeOf("https://x.com/docs/intro");
  assert.deepEqual(scope, { origin: "https://x.com", prefix: "/docs/" });

  assert.ok(inScope("https://x.com/docs/api/play", scope));
  assert.ok(inScope("https://x.com/docs", scope), "the section root itself");
  assert.ok(!inScope("https://x.com/blog/post", scope), "outside the prefix");
  assert.ok(!inScope("https://x.com/docsy/page", scope), "prefix is a segment, not a substring");
  assert.ok(!inScope("https://other.com/docs/x", scope), "other origin");
  assert.ok(!inScope("https://x.com/docs/logo.png", scope), "binary asset");
});

test("a deep versioned link still scopes to the whole docs section", () => {
  assert.deepEqual(scopeOf("https://x.com/docs/2026-07-28/getting-started/intro"), {
    origin: "https://x.com",
    prefix: "/docs/",
  });
});

test("links resolve relative hrefs and drop fragments", () => {
  const links = extractLinks(
    `<a href="/docs/a">A</a> <a href="b#part">B</a> <a href="mailto:x@y.z">m</a>
     <a href="https://x.com/docs/a?utm=1">dup</a>`,
    "https://x.com/docs/index",
  );
  assert.deepEqual(links, ["https://x.com/docs/a", "https://x.com/docs/b"]);
});

test("normalize strips hash and query", () => {
  assert.equal(normalizeUrl("https://x.com/a?b=1#c"), "https://x.com/a");
});

// ─── the walk itself, on a fake site ─────────────────────────────────────────

const page = (body: string, links: string[] = []) => ({
  status: 200,
  text: `<html><body><p>${body.repeat(40)}</p>${links
    .map((l) => `<a href="${l}">x</a>`)
    .join("")}</body></html>`,
  contentType: "text/html",
  location: null,
});

test("walk finds linked pages and stays in scope", async () => {
  const site: Record<string, ReturnType<typeof page>> = {
    "https://x.com/docs/": page("intro text ", ["/docs/a", "/docs/b", "/blog/off-topic"]),
    "https://x.com/docs/a": page("api reference "),
    "https://x.com/docs/b": page("guide text "),
    "https://x.com/blog/off-topic": page("should never be fetched "),
  };
  const fetched: string[] = [];
  const fetcher: Fetcher = async (url) => {
    fetched.push(url);
    const p = site[url];
    if (!p) return { status: 404, text: "", contentType: "text/html", location: null };
    return p;
  };

  const found = await discoverPages("https://x.com/docs/", 50, fetcher);
  assert.equal(found.via, "crawl");
  assert.deepEqual(found.pages.sort(), [
    "https://x.com/docs/",
    "https://x.com/docs/a",
    "https://x.com/docs/b",
  ]);
  assert.ok(!fetched.includes("https://x.com/blog/off-topic"));
});

test("a JS shell fails loudly and names the fix", async () => {
  const shell = {
    status: 200,
    text: `<html><head><link href="/_app/x.js"></head><body></body></html>`,
    contentType: "text/html",
    location: null,
  };
  const fetcher: Fetcher = async () => shell;

  await assert.rejects(
    () => discoverPages("https://shell.com/docs", 50, fetcher),
    /JavaScript shell.*GitHub/s,
  );
});

test("llms.txt links win over everything but github", async () => {
  const { parseLlmsTxt } = await import("./crawl");
  const listed = parseLlmsTxt(
    "# Docs\n\n- [Intro](/docs/intro): start here\n- [API](https://x.com/docs/api)\nhttps://x.com/docs/extra\n",
    "https://x.com",
  );
  assert.deepEqual(listed, [
    "https://x.com/docs/intro",
    "https://x.com/docs/api",
    "https://x.com/docs/extra",
  ]);
  // A catch-all route answering HTML for /llms.txt is not an llms.txt.
  assert.deepEqual(parseLlmsTxt("<!doctype html><a href='/x'>x</a>", "https://x.com"), []);

  const fetcher: Fetcher = async (url) => {
    if (url === "https://x.com/llms.txt") {
      return {
        status: 200,
        text: "- [A](/docs/a)\n- [B](/docs/b)\n- [Blog](/blog/post)",
        contentType: "text/plain",
        location: null,
      };
    }
    if (url === "https://x.com/docs/") return page("intro text ");
    throw new Error(`unexpected fetch ${url}`);
  };
  const found = await discoverPages("https://x.com/docs/", 50, fetcher);
  assert.equal(found.via, "llms.txt");
  assert.deepEqual(found.pages, ["https://x.com/docs/a", "https://x.com/docs/b"]);
});

test("a JS shell that links its repository falls back to github", async () => {
  const { findGitHubRepoInHtml } = await import("./crawl");
  assert.equal(
    findGitHubRepoInHtml(
      `<a href="https://github.com/features/actions">f</a>
       <a href="https://github.com/StakeEngine/docs">source</a>`,
    ),
    "https://github.com/StakeEngine/docs",
  );
  assert.equal(findGitHubRepoInHtml(`<p>no links</p>`), null);
});

test("gap top-up picks unread pages whose path words match the failed questions", async () => {
  const { pickTopUpPages } = await import("./crawl");
  const picked = pickTopUpPages(
    [
      "https://x.com/docs/api/bet-replay",
      "https://x.com/docs/api/authenticate",
      "https://x.com/docs/pricing",
      "https://x.com/docs/api/balance",
    ],
    ["What does the bet-replay endpoint return?", "How does authenticate work?"],
    new Set(["https://x.com/docs/api/balance"]),
  );
  assert.deepEqual(picked, [
    "https://x.com/docs/api/bet-replay",
    "https://x.com/docs/api/authenticate",
  ]);
});

test("versioned docs keep only the newest release, drafts drop", async () => {
  const { currentVersionOnly } = await import("./crawl");
  const { kept, dropped, version } = currentVersionOnly([
    "https://x.com/docs/2024-11-05/intro",
    "https://x.com/docs/2026-07-28/intro",
    "https://x.com/docs/2026-07-28/develop/build",
    "https://x.com/docs/draft/intro",
    "https://x.com/docs/community/faq",
  ]);
  assert.equal(version, "2026-07-28");
  assert.equal(dropped, 2);
  assert.deepEqual(kept, [
    "https://x.com/docs/2026-07-28/intro",
    "https://x.com/docs/2026-07-28/develop/build",
    "https://x.com/docs/community/faq",
  ]);
});

test("sitemap wins over walking when it lists the section", async () => {
  const fetcher: Fetcher = async (url) => {
    if (url === "https://x.com/sitemap.xml") {
      return {
        status: 200,
        text: `<urlset><url><loc>https://x.com/docs/a</loc></url><url><loc>https://x.com/docs/b</loc></url><url><loc>https://x.com/pricing</loc></url></urlset>`,
        contentType: "application/xml",
        location: null,
      };
    }
    // resolveStart probes the start page for redirects before anything else.
    if (url === "https://x.com/docs/") return page("intro text ");
    throw new Error(`unexpected fetch ${url}`);
  };

  const found = await discoverPages("https://x.com/docs/", 50, fetcher);
  assert.equal(found.via, "sitemap");
  assert.deepEqual(found.pages, ["https://x.com/docs/a", "https://x.com/docs/b"]);
});

test("a repo's own plumbing is not its documentation", async () => {
  const { isDocPath } = await import("./crawl");
  // Measured on prod: these were ingested as product documentation.
  for (const junk of [
    "CHANGELOG.md",
    "packages/expo-router/CHANGELOG.md",
    "CONTRIBUTING.md",
    "LICENSE.md",
    ".expo-code-review/agents/security.md",
    ".claude/skills/playwright-dev/api.md",
    ".github/actions/next-repo-actions/dist/prs/licenses.txt",
    "node_modules/left-pad/readme.md",
  ]) {
    assert.equal(isDocPath(junk), false, junk);
  }
  // And these are real chapters that a coarser rule would have eaten.
  for (const doc of [
    "docs/pages/build/setup.mdx", // expo documents EAS Build here
    "docs/test/writing-tests.mdx", // bun documents its test runner here
    "runtime/test/index.md",
    "docs/guides/migration.md",
    "README.md",
    "src/routes/docs/math-sdk/quick-start/+page.svx",
  ]) {
    assert.equal(isDocPath(doc), true, doc);
  }
});
