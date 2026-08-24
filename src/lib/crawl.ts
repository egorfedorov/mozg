import { checkFetchableUrl } from "@/lib/url-guard";
import { stripHtml } from "@/lib/page";
import { env } from "@/lib/env";

/**
 * One link -> every documentation page behind it.
 *
 * Three strategies, tried in order of how much they can be trusted:
 *
 *   1. GitHub — the URL names a repository (or a directory in one). The git
 *      tree lists every file at once, and source markdown beats rendered HTML
 *      anyway: API tables arrive as data, not as markup to unpick.
 *   2. Sitemap — the site publishes sitemap.xml. One fetch names every page;
 *      no walking, no missed corners.
 *   3. Link walk — fetch the start page, follow same-section links, repeat.
 *      The fallback, because it sees only what pages link to.
 *
 * The failure that must be honest: a docs site that is a JavaScript shell
 * (stake-engine.com is one) serves the same empty HTML for every path —
 * including its own sitemap.xml. Crawling it would ingest the word "Loading"
 * two hundred times and report success. That case throws, and the error names
 * the fix: point at the GitHub repository the site is built from.
 */

export interface Discovery {
  pages: string[];
  via: "github" | "llms.txt" | "sitemap" | "crawl";
  /** Set when the cap trimmed the list — silent truncation reads as coverage. */
  note?: string;
}

// ─── versioned docs ──────────────────────────────────────────────────────────

/** Path segments named like a release date, e.g. /docs/2026-07-28/…. */
const DATED = /(^|\/)(\d{4}-\d{2}-\d{2})(\/|$)/;

/**
 * Keep only the newest dated version, drop drafts. Same rule the catalogue
 * seeder learned on MCP: its sitemap lists every published spec side by side,
 * and a brain holding six versions of one protocol contradicts itself on
 * every detail — worse than no brain at all.
 */
export function currentVersionOnly(pages: string[]): {
  kept: string[];
  dropped: number;
  version: string | null;
} {
  const pathOf = (p: string) => {
    try {
      return new URL(p).pathname;
    } catch {
      return p;
    }
  };

  const versions = new Set<string>();
  for (const p of pages) {
    const m = pathOf(p).match(DATED);
    if (m) versions.add(m[2]);
  }
  if (!versions.size) return { kept: pages, dropped: 0, version: null };

  const newest = [...versions].sort().at(-1)!;
  const kept = pages.filter((p) => {
    const path = pathOf(p);
    if (path.includes("/draft/")) return false;
    const m = path.match(DATED);
    return !m || m[2] === newest;
  });
  return { kept, dropped: pages.length - kept.length, version: newest };
}

/** Version-filter, cap, and say honestly what was left out. */
function finalize(all: string[], cap: number, via: Discovery["via"], extraNote?: string): Discovery {
  const { kept, dropped, version } = currentVersionOnly(all);
  const notes: string[] = [];
  if (dropped) {
    notes.push(`kept only version ${version}, dropped ${dropped} older or draft pages`);
  }
  if (kept.length > cap) {
    notes.push(`found ${kept.length} pages, kept the first ${cap} (source limit)`);
  }
  if (extraNote) notes.push(extraNote);
  return { pages: kept.slice(0, cap), via, note: notes.join("; ") || undefined };
}

/** File endings that are documentation, for GitHub trees. */
const DOC_ENDINGS = [".md", ".mdx", ".svx", ".txt", ".rst", ".adoc"];

/** Never worth fetching on a link walk. PDFs are deliberately absent: specs
 *  live in them, and the ingest side reads them through the PDF pipeline. */
const SKIP_ENDINGS =
  /\.(png|jpe?g|gif|svg|webp|ico|css|js|mjs|json|xml|zip|tar|gz|mp4|webm|woff2?|ttf|eot)$/i;

/**
 * Repository directories that hold markdown but never documentation.
 *
 * "Every .md in the tree" is the right default for a docs repo and the wrong
 * one for a product monorepo: measured on prod, a run over expo, next.js and
 * playwright also ingested `.expo-code-review/agents/*.md`, `.claude/skills/*`,
 * `.github/actions/**\/dist/licenses.txt` — the repo's own tooling, read as if
 * it were the product's manual.
 *
 * Only directories that cannot mean anything else are listed. `build/` and
 * `test/` are deliberately absent: expo documents EAS Build under
 * `docs/pages/build/` and bun documents its test runner under `docs/test/`, so
 * a rule on those names would drop real chapters — the mistake this cannot
 * afford, since a brain that quietly lost a chapter still scores itself as
 * complete.
 */
const NOT_DOCS = /(^|\/)(\.[^/]+|node_modules|vendor|dist|__tests__)\//;

/**
 * Repository housekeeping files. A CHANGELOG is the single most expensive page
 * measured (expo's, at 41¢ for 393 notes of "fixed X in Y") and the least
 * useful: an agent asking how something works is never answered by the list of
 * releases in which it changed.
 */
const NOT_DOC_FILE =
  /(^|\/)(changelog|changes|history|release[-_]notes|licen[sc]es?|code[-_]of[-_]conduct|contributing|authors|governance|maintainers|notice)\.[a-z]+$/i;

/**
 * Source files worth reading for conventions.
 *
 * Deliberately not "every text file in the tree". A repo brain answers "how do
 * we do X *here*" — the layout, the naming, the local decisions — and that
 * lives in hand-written source and hand-written config. A lockfile, a
 * generated client and a minified bundle are all text, all enormous, and all
 * answer nothing: the measured lesson from the docs crawler was a CHANGELOG at
 * 41 cents for 393 useless notes, and a lockfile is that failure an order of
 * magnitude worse.
 *
 * Markdown is in the list, because a repo's own README and ADRs are the most
 * concentrated statement of its conventions that exists.
 */
const CODE_ENDINGS = [
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift",
  ".c", ".h", ".cc", ".cpp", ".hpp", ".cs", ".php",
  ".sql", ".sh", ".gd", ".svelte", ".vue",
  ".md", ".mdx", ".toml", ".yaml", ".yml",
];

/**
 * Paths that are text, and are not this codebase's conventions.
 *
 * Three families, each of which would otherwise dominate the crawl by volume:
 * dependencies and build output (never written by this team), lockfiles and
 * generated artefacts (written by a tool, and enormous), and the vendored or
 * minified copies of other people's code. Tests are deliberately KEPT — a test
 * is often the only written statement of how a thing is meant to be called.
 */
const NOT_SOURCE =
  /(^|\/)(node_modules|vendor|third_party|dist|build|out|target|coverage|\.git|\.next|__pycache__|migrations?\/generated)\//i;

const NOT_SOURCE_FILE =
  /(^|\/)([^/]*\.(min|bundle|generated|gen|pb|d)\.[a-z]+|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|go\.sum|composer\.lock)$/i;

/** Prose extensions — the files a repo crawl picks up that are still writing,
 *  not code. Read with the ordinary knowledge prompt. */
const PROSE_ENDINGS = /\.(md|mdx|txt|rst|adoc)$/i;

/**
 * Is this URL a source file the crawl pulled out of a repository?
 *
 * Asked of the child page rather than carried on it. The crawl writes children
 * as plain `url` sources pointing at raw.githubusercontent.com, so the
 * provenance a later read needs is already in the address — a column would be
 * a second copy of a fact that cannot disagree with itself this way.
 *
 * Prose is excluded even inside a repo: a README is documentation that happens
 * to live in git, and reading it with the code framing would ask a model for
 * the conventions of a paragraph.
 */
export function isCodeMaterial(url: string | null): boolean {
  if (!url) return false;
  let host: string, path: string;
  try {
    const u = new URL(url);
    host = u.hostname;
    path = u.pathname;
  } catch {
    return false;
  }
  if (host !== "raw.githubusercontent.com") return false;
  return !PROSE_ENDINGS.test(path);
}

/** Is this repo path hand-written source, or dependency and build output? */
export function isSourcePath(path: string): boolean {
  return !NOT_SOURCE.test(path) && !NOT_SOURCE_FILE.test(path);
}

/** Is this repo path the product's documentation, or the repo's own plumbing? */
export function isDocPath(path: string): boolean {
  return !NOT_DOCS.test(path) && !NOT_DOC_FILE.test(path);
}

// ─── GitHub ──────────────────────────────────────────────────────────────────

export interface GitHubRef {
  repo: string; // "owner/name"
  ref: string; // branch, tag or "HEAD"
  path: string; // "" or "docs/"
}

/** github.com/o/r, github.com/o/r/tree/main/docs, raw.githubusercontent.com/… */
export function parseGitHubUrl(raw: string): GitHubRef | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const parts = url.pathname.split("/").filter(Boolean);

  if (url.hostname === "github.com" && parts.length >= 2) {
    const repo = `${parts[0]}/${parts[1]}`;
    if (parts.length === 2) return { repo, ref: "HEAD", path: "" };
    if ((parts[2] === "tree" || parts[2] === "blob") && parts.length >= 4) {
      const dir = parts.slice(4).join("/");
      return { repo, ref: parts[3], path: dir ? `${dir}/` : "" };
    }
    return { repo, ref: "HEAD", path: "" };
  }

  if (url.hostname === "raw.githubusercontent.com" && parts.length >= 3) {
    const dir = parts.slice(3).join("/").replace(/\/[^/]*$/, "");
    return {
      repo: `${parts[0]}/${parts[1]}`,
      ref: parts[2],
      path: dir ? `${dir}/` : "",
    };
  }

  return null;
}

/** What a crawl of a repository is looking for. */
export type RepoRead = "docs" | "code";

async function githubPages(
  gh: GitHubRef,
  cap: number,
  read: RepoRead = "docs",
): Promise<Discovery> {
  const res = await fetch(
    `https://api.github.com/repos/${gh.repo}/git/trees/${gh.ref}?recursive=1`,
    {
      headers: { accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!res.ok) {
    throw new Error(
      `GitHub answered ${res.status} for ${gh.repo} — a private repository, ` +
        "a wrong branch, or a rate limit. Public repositories work without a key.",
    );
  }
  const tree = (await res.json()) as { tree: { path: string; type: string }[] };

  const code = read === "code";
  const endings = code ? CODE_ENDINGS : DOC_ENDINGS;
  const keep = code ? isSourcePath : isDocPath;

  const found = tree.tree
    .filter((t) => t.type === "blob")
    .map((t) => t.path)
    .filter((p) => p.startsWith(gh.path) && endings.some((e) => p.endsWith(e)))
    .sort();
  const files = found.filter(keep);
  const plumbing = found.length - files.length;

  if (!files.length) {
    throw new Error(
      code
        ? `no source files under ${gh.repo}/${gh.path || ""} — point at the ` +
          "directory that holds the code, or add it as a documentation source"
        : `no documentation files (${DOC_ENDINGS.join(", ")}) under ` +
          `${gh.repo}/${gh.path || ""} — point at the directory that holds the docs`,
    );
  }

  return finalize(
    files.map((p) => `https://raw.githubusercontent.com/${gh.repo}/${gh.ref}/${p}`),
    cap,
    "github",
    plumbing ? `skipped ${plumbing} repository files that are not documentation` : undefined,
  );
}

// ─── fetching, guarded ───────────────────────────────────────────────────────

interface Fetched {
  status: number;
  text: string;
  contentType: string;
  /** Where a redirect points, resolved against the request URL. */
  location: string | null;
}

const MAX_PAGE_BYTES = 5 * 1024 * 1024;

/** Injectable so the walk logic is testable without a network. */
export type Fetcher = (url: string) => Promise<Fetched>;

/** Fetch through the headless renderer: scripts run, then the HTML is read.
 *  Slow (seconds a page) — the walk's last resort, never its first. */
async function fetchRendered(url: string): Promise<Fetched> {
  const guard = await checkFetchableUrl(url);
  if (!guard.ok) throw new Error(`refusing to render ${url}: ${guard.reason}`);

  const res = await fetch(`${env.RENDER_URL}/render`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`renderer answered ${res.status} for ${url}`);
  const { html, status } = (await res.json()) as { html?: string; status?: number };
  return {
    status: status && status >= 400 ? status : 200,
    text: html ?? "",
    contentType: "text/html",
    location: null,
  };
}

async function fetchGuarded(url: string): Promise<Fetched> {
  // Checked per fetch, like lib/page.ts: DNS can change mid-crawl on purpose.
  const guard = await checkFetchableUrl(url);
  if (!guard.ok) throw new Error(`refusing to fetch ${url}: ${guard.reason}`);

  const res = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    redirect: "manual",
    headers: { "user-agent": "mozg/0.1 (+https://mozg.sh)" },
  });

  const location = res.headers.get("location");
  return {
    status: res.status,
    text: res.status >= 300 ? "" : (await res.text()).slice(0, MAX_PAGE_BYTES),
    contentType: (res.headers.get("content-type") ?? "").toLowerCase(),
    location: location ? new URL(location, url).toString() : null,
  };
}

// ─── scope ───────────────────────────────────────────────────────────────────

/**
 * The section the start URL names: its first path segment. Someone pasting
 * /docs/getting-started/intro means "learn these docs", not that one folder —
 * doc sites nest by version and chapter (/docs/2026-07-28/…), and a scope cut
 * at the deepest folder strands the crawl in a corner of them. The first
 * segment keeps it out of the blog and the pricing page, which is the fence
 * that matters; the page cap bounds the rest.
 */
export function scopeOf(startUrl: string): { origin: string; prefix: string } {
  const url = new URL(startUrl);
  const [first] = url.pathname.split("/").filter(Boolean);
  return { origin: url.origin, prefix: first ? `/${first}/` : "/" };
}

export function inScope(candidate: string, scope: { origin: string; prefix: string }): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  return (
    url.origin === scope.origin &&
    // "/docs" is the section it names, not a page outside "/docs/".
    `${url.pathname}/`.startsWith(scope.prefix) &&
    !SKIP_ENDINGS.test(url.pathname)
  );
}

/** One canonical form per page, or the visited set leaks duplicates. */
export function normalizeUrl(raw: string): string {
  const url = new URL(raw);
  url.hash = "";
  url.search = "";
  return url.toString();
}

// ─── llms.txt ────────────────────────────────────────────────────────────────

/**
 * Page URLs out of an llms.txt: markdown links plus bare URLs. The file is a
 * site's own curated reading list for language models — when it exists it
 * beats a sitemap, which lists everything including the pricing page.
 */
export function parseLlmsTxt(text: string, origin: string): string[] {
  // An HTML response for /llms.txt is a catch-all route, not the file.
  if (/^\s*</.test(text)) return [];

  const out: string[] = [];
  for (const m of text.matchAll(/\]\(([^)\s]+)\)|(?<=^|\s)(https?:\/\/[^\s)]+)/gm)) {
    const raw = m[1] ?? m[2];
    if (!raw) continue;
    try {
      out.push(normalizeUrl(new URL(raw, origin).toString()));
    } catch {
      // A relative fragment that is not a URL. Skip.
    }
  }
  return [...new Set(out)];
}

async function llmsTxtPages(
  startUrl: string,
  cap: number,
  fetcher: Fetcher,
): Promise<Discovery | null> {
  const scope = scopeOf(startUrl);

  let doc: Fetched;
  try {
    doc = await fetcher(`${scope.origin}/llms.txt`);
  } catch {
    return null;
  }
  if (doc.status !== 200) return null;

  const pages = parseLlmsTxt(doc.text, scope.origin)
    .filter((l) => inScope(l, scope))
    .sort();
  if (pages.length < 2) return null;

  return finalize(pages, cap, "llms.txt");
}

// ─── sitemap ─────────────────────────────────────────────────────────────────

/** <loc> values, whether the document is a sitemap or a sitemap index. */
export function parseSitemap(xml: string): { locs: string[]; isIndex: boolean } {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s][^<]*?)\s*<\/loc>/gi)].map((m) => m[1]);
  return { locs, isIndex: /<sitemapindex[\s>]/i.test(xml) };
}

async function sitemapPages(
  startUrl: string,
  cap: number,
  fetcher: Fetcher,
): Promise<Discovery | null> {
  const scope = scopeOf(startUrl);

  let doc: Fetched;
  try {
    doc = await fetcher(`${scope.origin}/sitemap.xml`);
  } catch {
    return null;
  }
  if (doc.status !== 200 || !doc.text.includes("<")) return null;

  const root = parseSitemap(doc.text);
  let locs = root.locs;
  if (root.isIndex) {
    // One level of index is the spec's own shape; deeper nesting is not.
    const children: string[] = [];
    for (const sitemapUrl of locs.slice(0, 10)) {
      try {
        const child = await fetcher(sitemapUrl);
        if (child.status === 200) children.push(...parseSitemap(child.text).locs);
      } catch {
        // A dead child sitemap loses its pages, not the whole discovery.
      }
    }
    locs = children;
  }

  const pages = [...new Set(locs.map((l) => normalizeUrl(l)))]
    .filter((l) => inScope(l, scope))
    .sort();

  // A JS shell serves its app HTML for /sitemap.xml too — parseSitemap finds
  // no <loc> in that, so an empty result falls through to the link walk.
  if (pages.length < 2) return null;

  return finalize(pages, cap, "sitemap");
}

// ─── link walk ───────────────────────────────────────────────────────────────

/** href values resolved against the page URL. Good enough for anchors. */
export function extractLinks(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<a\s[^>]*href\s*=\s*["']([^"'#][^"']*)["']/gi)) {
    try {
      const url = new URL(m[1], baseUrl);
      if (url.protocol === "http:" || url.protocol === "https:") {
        out.push(normalizeUrl(url.toString()));
      }
    } catch {
      // Not a URL — mailto:, javascript:, template garbage. Skip.
    }
  }
  return [...new Set(out)];
}

/** Under this much readable text, a page is a JS shell, not content. */
const SHELL_TEXT_CHARS = 300;

/** GitHub paths that are site sections, not repositories. */
const GITHUB_NON_REPOS = new Set([
  "features", "topics", "orgs", "about", "pricing", "sponsors", "settings",
  "marketplace", "collections", "trending", "login", "signup", "apps", "site",
]);

/**
 * A repository link buried in a page — footer, nav, meta tag. The escape
 * hatch for JS shells: the rendered site is unreadable, but it very often
 * links to the repository its docs are built from, which is readable.
 */
export function findGitHubRepoInHtml(html: string): string | null {
  for (const m of html.matchAll(/https?:\/\/github\.com\/([\w][\w.-]*)\/([\w][\w.-]*)/g)) {
    const [, owner, repo] = m;
    if (GITHUB_NON_REPOS.has(owner.toLowerCase())) continue;
    return `https://github.com/${owner}/${repo.replace(/\.git$/, "")}`;
  }
  return null;
}

async function walkPages(
  startUrl: string,
  cap: number,
  fetcher: Fetcher,
): Promise<Discovery> {
  const scope = scopeOf(startUrl);
  const start = normalizeUrl(startUrl);
  const queue: string[] = [start];
  const seen = new Set<string>([start]);
  const pages: string[] = [];
  let firstPageText: string | null = null;
  let firstHtml: string | null = null;

  while (queue.length && pages.length < cap) {
    // Small batches: parallel enough not to crawl one page at a time, small
    // enough not to hammer someone's docs host.
    const batch = queue.splice(0, 5);
    const results = await Promise.allSettled(batch.map((u) => fetcher(u)));

    for (let i = 0; i < batch.length; i++) {
      const r = results[i];
      if (r.status === "rejected") continue;
      const { status, text, contentType, location } = r.value;

      // Follow a redirect by queueing its target — /docs redirecting to
      // /docs/ is the most common first response a crawl ever sees.
      if (status >= 300 && status < 400 && location) {
        const target = normalizeUrl(location);
        if (!seen.has(target) && inScope(target, scope)) {
          seen.add(target);
          queue.push(target);
        }
        continue;
      }
      if (status !== 200) continue;

      const isMarkup = contentType.includes("html") || contentType.includes("xml");
      const readable = isMarkup ? stripHtml(text) : text.trim();
      firstPageText ??= readable;
      firstHtml ??= isMarkup ? text : null;
      if (readable.length >= SHELL_TEXT_CHARS) pages.push(batch[i]);

      if (isMarkup) {
        for (const link of extractLinks(text, batch[i])) {
          if (!seen.has(link) && inScope(link, scope)) {
            seen.add(link);
            queue.push(link);
          }
        }
      }
    }
  }

  if (!pages.length) {
    const isShell = firstPageText !== null && firstPageText.length < SHELL_TEXT_CHARS;

    // A shell usually still links to the repository it is built from — that
    // link is in the static HTML, so it survives without JavaScript. Follow
    // it before giving up; stake-engine.com is exactly this case.
    if (isShell && firstHtml) {
      const repoUrl = findGitHubRepoInHtml(firstHtml);
      const gh = repoUrl ? parseGitHubUrl(repoUrl) : null;
      if (gh) {
        try {
          const d = await githubPages(gh, cap);
          return {
            ...d,
            note: [
              `the site is a JavaScript shell, so its repository ${gh.repo} was read instead`,
              d.note,
            ]
              .filter(Boolean)
              .join("; "),
          };
        } catch {
          // The repo had no readable docs — fall through to the honest error.
        }
      }
    }

    throw new Error(
      (isShell
        ? "this site serves an empty JavaScript shell — the text only exists " +
          "after scripts run, which a crawler never does. "
        : "no readable pages were found here. ") +
        "If the documentation is built from a public GitHub repository, add " +
        "that repository's URL instead — the source files are better material " +
        "than the rendered site anyway.",
    );
  }

  return finalize(
    pages,
    cap,
    "crawl",
    queue.length > 0 && pages.length >= cap
      ? `stopped at ${cap} fetched pages; more links were left unvisited`
      : undefined,
  );
}

// ─── closing exam gaps from a known source ───────────────────────────────────

/**
 * Which not-yet-ingested pages of an already-trusted site most plausibly
 * answer the failed exam questions. Pure lexical overlap between question
 * words and URL path words — crude, but it only ever ranks pages from a
 * source the owner already chose, so a wrong pick costs one cheap page,
 * never a hallucinated URL.
 */
export function pickTopUpPages(
  candidates: string[],
  failedTexts: string[],
  existing: Set<string>,
  limit = 5,
): string[] {
  const terms = new Set(
    failedTexts
      .join(" ")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
  if (!terms.size) return [];

  return candidates
    .filter((c) => !existing.has(c))
    .map((c) => {
      let path = c;
      try {
        path = new URL(c).pathname;
      } catch {
        // Keep as-is; raw paths score the same way.
      }
      const words = path.toLowerCase().split(/[^\p{L}\p{N}]+/u);
      const score = words.filter((w) => w.length > 3 && terms.has(w)).length;
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.c);
}

// ─── entry point ─────────────────────────────────────────────────────────────

/**
 * Where the start URL really lands. Entry links redirect constantly — http to
 * https, /docs to /docs/, an unversioned path to this month's version — and a
 * scope built from the address *before* the redirect excludes every page the
 * site actually serves.
 */
async function resolveStart(startUrl: string, fetcher: Fetcher): Promise<string> {
  let url = startUrl;
  for (let hop = 0; hop < 3; hop++) {
    const res = await fetcher(url);
    if (res.status >= 300 && res.status < 400 && res.location) {
      url = res.location;
      continue;
    }
    break;
  }
  return url;
}

/**
 * Sites whose docs are a JS shell with no repository link even in the static
 * HTML, but whose source repository is public and known. One entry per
 * confirmed case — this is curator data, not a heuristic.
 */
const KNOWN_REPOS: Record<string, string> = {
  "stake-engine.com": "https://github.com/StakeEngine/docs",
};

export async function discoverPages(
  startUrl: string,
  cap: number,
  fetcher: Fetcher = fetchGuarded,
  read: RepoRead = "docs",
): Promise<Discovery> {
  const gh = parseGitHubUrl(startUrl);
  if (gh) return githubPages(gh, cap, read);

  // Reading a codebase means reading a repository. There is no link walk that
  // produces one, and silently falling back to crawling a website would hand
  // the caller a brain full of marketing pages under the name they asked for.
  if (read === "code") {
    throw new Error(
      `a repository source needs a GitHub URL — ${startUrl} is not one`,
    );
  }

  const known = KNOWN_REPOS[new URL(startUrl).hostname.replace(/^www\./, "")];
  if (known) {
    const d = await githubPages(parseGitHubUrl(known)!, cap);
    return {
      ...d,
      note: [`read from its source repository ${known.slice(19)}`, d.note]
        .filter(Boolean)
        .join("; "),
    };
  }

  const start = await resolveStart(startUrl, fetcher);
  const listed =
    (await llmsTxtPages(start, cap, fetcher)) ??
    (await sitemapPages(start, cap, fetcher));
  if (listed) return listed;

  try {
    return await walkPages(start, cap, fetcher);
  } catch (err) {
    // The site is a JS shell with no repository to fall back to. With a
    // renderer wired up, walk it again letting the scripts run — capped
    // tighter, because every page now costs a real browser a few seconds.
    if (env.RENDER_URL && fetcher === fetchGuarded) {
      const rendered = await walkPages(start, Math.min(cap, 80), fetchRendered).catch(
        () => null,
      );
      if (rendered) {
        return {
          ...rendered,
          note: ["read with a headless browser — the site only exists after JavaScript runs", rendered.note]
            .filter(Boolean)
            .join("; "),
        };
      }
    }
    throw err;
  }
}
