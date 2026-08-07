import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, fromAcceptLanguage, isLocale } from "@/lib/locales";

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
  return createHash("sha1").update(english.trim().replace(/\s+/g, " ")).digest("hex").slice(0, 12);
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
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
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

/**
 * Mark a translatable string that lives in data rather than in JSX.
 *
 * Half the words on this site are not in a paragraph: they are the labels of
 * the footer columns, the menu, the cards on the landing page — arrays of
 * objects declared above the component. `t()` cannot be called there (it is
 * async, and the array is module scope), and the render site calls
 * `t(card.title)`, which scripts/translate.ts cannot see because it collects
 * string literals, not variables.
 *
 * So the literal is marked where it is written and translated where it is
 * shown:
 *
 *   const CARDS = [{ title: msg("Our components, not Tailwind's") }];
 *   …
 *   <h3>{t(card.title)}</h3>
 *
 * Identity at runtime. It exists to be greppable — which is the whole trick,
 * and the reason it is a function call rather than a comment.
 */
export function msg(english: string): string {
  return english;
}
