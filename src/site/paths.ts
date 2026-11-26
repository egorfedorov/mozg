/**
 * Where a page lives in each language.
 *
 * English is at the root and the other languages behind their own prefix, the
 * way a search engine expects it: `/`, `/de/`, `/zh-tw/`. Which languages
 * exist is not typed here. It is read from `coverage.generated.ts`, which
 * `npm run i18n:check` writes from what is really translated, so a language
 * appears in the routes and the picker on the day its last sentence is done,
 * and not before.
 */

import { COVERAGE } from "@/i18n/coverage.generated";
import { LANGS, LANG_TAG, type Lang } from "@/lib/i18n";

/** English, and every language whose site is translated in full. */
export const SITE_LANGS: Lang[] = LANGS.filter((lang) => lang === "en" || COVERAGE[lang]?.messages === 1);

/** Of those, the ones whose documentation is translated in full too. */
export const DOCS_LANGS: Lang[] = SITE_LANGS.filter((lang) => lang === "en" || COVERAGE[lang]?.docs === 1);

/** A path that always ends the way the exported folders do: `/`, `/changelog/`. */
export function slashed(path: string): string {
  const clean = path.replace(/^\/+|\/+$/g, "");
  return clean ? `/${clean}/` : "/";
}

/** The address of a page in a language. */
export function sitePath(lang: Lang, path: string): string {
  const clean = slashed(path);
  return lang === "en" ? clean : `/${lang}${clean}`;
}

/** The variants of one page, for `hreflang`: the tag of each language and its address. */
export function alternatesFor(path: string, langs: Lang[] = SITE_LANGS): Record<string, string> {
  return Object.fromEntries([["x-default", sitePath("en", path)], ...langs.map((lang) => [LANG_TAG[lang], sitePath(lang, path)])]);
}

/** Re-exported, so a page imports the addresses and the tags from one place. */
export { LANG_TAG } from "@/lib/i18n";
