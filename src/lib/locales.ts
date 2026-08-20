/**
 * The languages the site is offered in.
 *
 * The reading half only. Brains, notes, exams and the goal a brain is scored
 * against stay English, and that is a decision rather than a shortcut: a brain
 * is worth something because of the exam it sat, and a translated note is a
 * note nobody examined. Splitting the material into twelve versions would
 * split the one number the product is sold on.
 *
 * It costs less than it looks to leave it that way. Retrieval is already
 * cross-lingual — the embedder is bge-m3, and a Russian question against an
 * English brain returns the right English notes today — so an agent asking in
 * any of these already works. What does not work is the shopfront, which is
 * what this file is for.
 */

export interface Locale {
  code: string;
  /** What speakers of it call it. Never the English name — a picker that says
   *  "Japanese" is a picker for people who already read English. */
  native: string;
  /** Right-to-left scripts need dir on <html>, not just a font. */
  rtl?: boolean;
}

export const LOCALES: Locale[] = [
  { code: "en", native: "English" },
  { code: "ar", native: "العربية", rtl: true },
  { code: "zh-Hans", native: "简体中文" },
  { code: "zh-Hant", native: "繁體中文" },
  { code: "fr", native: "Français" },
  { code: "hi", native: "हिन्दी" },
  { code: "ja", native: "日本語" },
  { code: "pt", native: "Português" },
  { code: "ru", native: "Русский" },
  { code: "es", native: "Español" },
  { code: "th", native: "ไทย" },
  { code: "ur", native: "اردو", rtl: true },
];

export const DEFAULT_LOCALE = "en";

/** The cookie the picker sets. Read on every render of a public page. */
export const LOCALE_COOKIE = "mozg_lang";

export function isLocale(code: string | undefined | null): code is string {
  return Boolean(code) && LOCALES.some((l) => l.code === code);
}

export function localeOf(code: string | undefined | null): Locale {
  return LOCALES.find((l) => l.code === code) ?? LOCALES[0];
}

/**
 * Pick a language from an Accept-Language header.
 *
 * Deliberately crude: match the full tag, then the primary subtag, in the
 * order the browser asked for. Chinese is the one that needs care — `zh-TW`
 * and `zh-HK` are Traditional, everything else Simplified — because getting
 * that backwards is not a small mistake to a reader.
 */
export function fromAcceptLanguage(header: string | null): string {
  if (!header) return DEFAULT_LOCALE;

  const asked = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((a) => a.tag)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of asked) {
    if (tag.startsWith("zh")) {
      return /\b(tw|hk|mo|hant)\b/.test(tag) ? "zh-Hant" : "zh-Hans";
    }
    const exact = LOCALES.find((l) => l.code.toLowerCase() === tag);
    if (exact) return exact.code;
    const primary = tag.split("-")[0];
    const loose = LOCALES.find((l) => l.code.toLowerCase() === primary);
    if (loose) return loose.code;
  }
  return DEFAULT_LOCALE;
}

/** A year: the choice has to survive the site and the next visit. */
const LOCALE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Browser-side write, in a module rather than in the component — the same
 * shape lib/consent.ts uses, and the same reason: a cookie is not React state,
 * and writing one from inside a component body is the thing the lint rule is
 * there to catch.
 *
 * Not gated on consent. A language choice is what the reader just asked for
 * out loud; storing it is doing what they said, not tracking them.
 */
export function writeLocale(code: string): void {
  // Domain-scoped to the registrable domain, not to the host it was chosen on.
  //
  // Without it the cookie is host-only: a reader who picked Russian on mozg.sh
  // arrived at gen.mozg.sh in English, and at learn. and gallery. too. Worse
  // than plain English, because the pages are half-translated — the strings
  // that happen to be cached render in one language and the rest in another.
  //
  // Only when we are actually on mozg.sh. `Domain=.localhost` is rejected
  // outright by browsers, and naming a domain the page is not on would have
  // the cookie silently dropped in development, which is the kind of bug that
  // only shows up after a deploy.
  const onMozg = location.hostname.endsWith("mozg.sh");
  const secure = location.protocol === "https:" ? "; Secure" : "";

  // Clear the host-only cookie first. Browsers key cookies by (name, domain,
  // path), so the old one does not get overwritten by the domain-scoped one —
  // it sits beside it, both are sent, and the server reads whichever comes
  // first. That is the same two-cookies-one-name trap the session cookie fell
  // into (see middleware.ts), and it presents as a language choice that will
  // not stick.
  if (onMozg) {
    document.cookie = `${LOCALE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  }

  document.cookie =
    `${LOCALE_COOKIE}=${code}; Path=/; Max-Age=${LOCALE_MAX_AGE}; SameSite=Lax` +
    (onMozg ? "; Domain=.mozg.sh" : "") +
    secure;
}
