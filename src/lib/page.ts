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

export async function fetchPageText(url: string): Promise<string> {
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
  if (res.status >= 300 && res.status < 400) {
    throw new Error(`${url} redirects — add the final URL instead`);
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
  if (looksLikeMarkup && text.length < 300 && env.RENDER_URL) {
    const rendered = await renderPage(url).catch(() => null);
    if (rendered && rendered.length > text.length) return rendered;
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
