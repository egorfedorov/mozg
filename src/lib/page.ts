import { createHash } from "node:crypto";
import { checkFetchableUrl } from "@/lib/url-guard";
import { env } from "@/lib/env";

/**
 * Fetching a page, in one place.
 *
 * Ingest reads a page to extract notes from it; the maintenance pass reads the
 * same page to find out whether it changed. If those two used different
 * fetchers the hash would drift from the material and every page would look
 * changed forever.
 */

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Shorter than this and the fetch brought back nothing to read.
 *
 * Thirty characters will not hold a sentence, let alone a note, and a document
 * that small has always meant something went wrong upstream — a symlink served
 * as its own target, a stub, a login wall, an error page with the words in an
 * image. It used to go to the model anyway, which then declined in prose
 * instead of calling the tool, and the source failed with "model did not call
 * save_notes" — a sentence that names neither the page nor the reason. Refusing
 * here costs a model call and produces an error somebody can act on.
 */
const MIN_TEXT = 30;

/**
 * Redirects and symlinks followed before we call it a loop. Three is more than
 * any real documentation link needs (http→https→canonical) and far fewer than
 * a redirect cycle would take to notice.
 */
export const MAX_HOPS = 3;

/**
 * The page came back fine and holds nothing worth reading.
 *
 * A permanent fact about that URL, not a failure of the run: mkdocs stub pages
 * like pydantic's `pydantic_extra_types_isbn.md` are twenty-nine characters of
 * include directive and will be twenty-nine characters tomorrow. Thrown as its
 * own type so the worker can stop retrying — one such page filed four identical
 * rows in the error centre (0967b0d5, 2026-08-12), three of which were pg-boss
 * re-reading a stub in the hope it had grown. The source row still carries the
 * reason, which is where the owner looks.
 *
 * NOT used when the renderer was needed and unavailable: a JS shell we could
 * not render is a real outage and deserves both the retry and the error row.
 */
export class EmptyPageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmptyPageError";
  }
}

/**
 * A git symlink, as raw.githubusercontent serves it.
 *
 * GitHub's raw host does not follow symlinks: it returns a file whose entire
 * body is the link target, one relative path and nothing else. `AGENTS.md ->
 * CLAUDE.md` is the convention half the repositories worth crawling now use,
 * so without this every one of those sources ingests the nine characters
 * "CLAUDE.md" and fails.
 *
 * Deliberately narrow. One line, no whitespace, a file extension, no scheme
 * and no host — anything looser and a page that happens to be one short word
 * would send the crawler somewhere it was never pointed at.
 */
export function symlinkTarget(url: string, text: string): string | null {
  const here = new URL(url);
  if (here.hostname !== "raw.githubusercontent.com") return null;

  // A one-line file is a symlink OR a Claude Code import directive, and on the
  // raw host the two are indistinguishable apart from the `@`. vitest's
  // CLAUDE.md is the single line `@AGENTS.md`, which resolved to
  // .../HEAD/@AGENTS.md and 404ed on every refresh pass.
  //
  // Only a bare filename, because a leading `@` in front of a *path* is an npm
  // scope (`@scope/pkg.md`) at least as often as it is an import, and this
  // function's whole discipline is refusing to guess. An `@docs/FILE.md`
  // import therefore still misses — exactly as it does today, so nothing that
  // works now stops working.
  // lazy: one shape, no fallback chain. If `@dir/file.md` imports show up in
  // the error centre, make the caller try both forms rather than widening this.
  const body = text.trim().replace(/^@(?=[\w.]+$)/, "");
  if (!body || body.length > 200 || /\s/.test(body)) return null;
  if (!/^[\w.@+-]+(?:\/[\w.@+-]+)*$/.test(body) || !/\.[a-z0-9]+$/i.test(body)) return null;

  const target = new URL(body, here);
  // Same host by construction; the pathname check catches a link to itself,
  // which would otherwise be one wasted round trip per fetch forever.
  if (target.href === here.href) return null;
  return target.href;
}

export async function fetchPageText(url: string, hops = 0): Promise<string> {
  // Re-checked on every fetch, not just when the source was added: DNS can
  // change in between, so a hostname that resolved publicly then could point
  // at an internal address by the time we get here.
  const guard = await checkFetchableUrl(url);
  if (!guard.ok) throw new Error(`refusing to fetch: ${guard.reason}`);

  const res = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    redirect: "manual", // a redirect could land somewhere the guard rejected
    headers: { "user-agent": "mozg/0.1 (+https://mozg.sh)" },
  });
  // A redirect used to be refused outright, and the reason was sound: the SSRF
  // guard checked the URL we were given, not wherever it points. But refusing
  // every 3xx means ordinary documentation fails — MDN and web.dev reorganise
  // constantly, and today alone eleven ingests died on links that a browser
  // would have followed without a word.
  //
  // So follow it, through the front door: the recursive call runs
  // checkFetchableUrl on the destination like any other URL, which is exactly
  // the check refusing it was protecting. The hop budget is the loop guard.
  if (res.status >= 300 && res.status < 400) {
    const to = res.headers.get("location");
    if (!to || hops >= MAX_HOPS) {
      throw new Error(`${url} redirects — add the final URL instead`);
    }
    return fetchPageText(new URL(to, url).href, hops + 1);
  }
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);

  // A 500 MB file would be read into memory before anything else could stop
  // it, so cap by declared length and then by what we actually read.
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) throw new Error("page is over 10 MB");

  const body = (await res.text()).slice(0, MAX_BYTES);

  // Only strip markup from markup. A raw .md or .txt URL is already the text
  // we want, and running the tag stripper over it eats every generic and JSX
  // fragment in the code samples — `Array<string>` becomes `Array`, which is
  // worse than useless in a brain about an SDK.
  const type = (res.headers.get("content-type") ?? "").toLowerCase();
  const looksLikeMarkup = type.includes("html") || type.includes("xml");
  const text = looksLikeMarkup ? stripHtml(body) : body.trim();

  // A JS shell serves markup with no words in it. When a renderer is wired
  // up, let the scripts run and read what they produce — same fallback the
  // crawler uses, so a rendered page hashes and refreshes consistently.
  let renderFailed = false;
  if (looksLikeMarkup && text.length < 300 && env.RENDER_URL) {
    const rendered = await renderPage(url).catch(() => {
      renderFailed = true;
      return null;
    });
    if (rendered && rendered.length > text.length) return rendered;
  }

  // Only from a body that is unmistakably a link target, and inside the same
  // hop budget the redirects use — a chain of either is a loop.
  if (hops < MAX_HOPS) {
    const target = symlinkTarget(url, text);
    // The guard runs again inside the recursive call — the target is a fresh
    // URL and gets checked like any other, which is the point of going back
    // through the front door rather than fetching it here.
    if (target) return fetchPageText(target, hops + 1);
  }

  if (text.trim().length < MIN_TEXT) {
    const message =
      `${url} returned ${text.trim().length} characters of text` +
      (text.trim() ? ` (${JSON.stringify(text.trim().slice(0, 60))})` : "") +
      " — nothing to extract from";
    // Permanent unless the renderer was the thing that failed. Same sentence
    // either way — only the type differs, and only the worker reads it.
    throw renderFailed ? new Error(message) : new EmptyPageError(message);
  }

  return text;
}

/** Ask the headless renderer for the post-JavaScript text of a page. The
 *  caller has already passed the URL guard; the renderer re-blocks private
 *  address literals on its side as defence in depth. */
export async function renderPage(url: string): Promise<string> {
  const res = await fetch(`${env.RENDER_URL}/render`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`renderer answered ${res.status}`);
  const { html } = (await res.json()) as { html?: string };
  if (!html) throw new Error("renderer returned no html");
  return stripHtml(html);
}

/**
 * A fingerprint of the readable text, not of the bytes. Pages carry CSRF
 * tokens, build ids and timestamps that change on every request — hashing the
 * raw response would report a change every single night and re-extract the
 * whole internet at the owner's expense.
 */
export function contentHash(text: string): string {
  const normalised = text.replace(/\s+/g, " ").trim().toLowerCase();
  return createHash("sha256").update(normalised).digest("hex");
}

/** lazy: good enough to feed a model. Swap for readability/turndown if pages
 *  start arriving as JS-rendered shells. */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
