import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, fromAcceptLanguage, isLocale } from "@/lib/locales";
import { normalize } from "@/lib/msg";
import type { ClientDictionary } from "@/lib/t-client";

/**
 * Translation for the reading half of the site.
 *
 * The English text stays in the page, in the JSX, as the source of truth —
 * this looks it up rather than replacing it. Two reasons, both learned the
 * hard way by everyone who has done the other thing: a page written as
 * `t("home.hero.title")` cannot be read, so it stops being edited; and a
 * translation that goes missing should print the English sentence, not the
 * key.
 *
 * Keys are a hash of the English. Change a sentence and its translations stop
 * matching it — which is correct, because they now say something the English
 * does not. The English shows until the next translation run catches up, and
 * scripts/translate.ts reports how many are stale.
 */

export function key(english: string): string {
  return createHash("sha1").update(normalize(english)).digest("hex").slice(0, 12);
}

type Dictionary = Record<string, string>;

// Dictionaries are JSON on disk, imported once per process. A handful of
// files of a few thousand short strings — no reason for a database round trip
// on every paragraph of every page.
const CACHE = new Map<string, Dictionary>();

async function dictionary(locale: string): Promise<Dictionary> {
  if (locale === DEFAULT_LOCALE) return {};
  const cached = CACHE.get(locale);
  if (cached) return cached;
  try {
    const mod = await import(`@/locales/${locale}.json`);
    const dict = (mod.default ?? mod) as Dictionary;
    CACHE.set(locale, dict);
    return dict;
  } catch {
    // A language listed in the picker with no file yet reads as English.
    CACHE.set(locale, {});
    return {};
  }
}

/**
 * The reader's language: what they picked, else what their browser asked for.
 *
 * Cookie first, deliberately — a reader who chose English on a Russian laptop
 * meant it, and having the header quietly override that choice on the next
 * page is the single most irritating thing a multilingual site can do.
 */
export async function currentLocale(): Promise<string> {
  // getAll, not get, and the LAST one wins.
  //
  // The language cookie used to be host-only and is now scoped to .mozg.sh, so
  // a reader who has both sends both — and get() returns the first, which is
  // the more specific one the browser leads with: the stale host-only copy.
  // That is how picking Russian on gen.mozg.sh left mozg.sh in English. The
  // middleware clears the leftover, but a deletion only lands on the next
  // request, and the page in front of somebody right now is the one they are
  // looking at.
  const all = (await cookies()).getAll(LOCALE_COOKIE);
  for (let i = all.length - 1; i >= 0; i--) {
    if (isLocale(all[i]?.value)) return all[i].value;
  }
  return fromAcceptLanguage((await headers()).get("accept-language"));
}

/**
 * Translate one string. Falls back to the English it was given, always.
 *
 *   const t = await translator();
 *   <p>{t("Nobody needs one brain.")}</p>
 */
export async function translator(): Promise<(english: string) => string> {
  const locale = await currentLocale();
  const dict = await dictionary(locale);
  return (english: string) => dict[key(english)] ?? english;
}

const CLIENT_CACHE = new Map<string, ClientDictionary>();

/**
 * The strings the browser half needs, for the root layout to hand to
 * <Translations>.
 *
 * A separate, much smaller file — the client components' strings only, keyed
 * by the English rather than by a hash, because the browser has no sha1. Both
 * halves of that are written by scripts/translate.ts from the same run, so the
 * two files cannot drift.
 */
export async function clientDictionary(): Promise<ClientDictionary> {
  const locale = await currentLocale();
  if (locale === DEFAULT_LOCALE) return {};
  const cached = CLIENT_CACHE.get(locale);
  if (cached) return cached;
  try {
    const mod = await import(`@/locales/client/${locale}.json`);
    const dict = (mod.default ?? mod) as ClientDictionary;
    CLIENT_CACHE.set(locale, dict);
    return dict;
  } catch {
    // No client strings translated for this language yet — English prints,
    // the same as a missing key does on the server side.
    CLIENT_CACHE.set(locale, {});
    return {};
  }
}
