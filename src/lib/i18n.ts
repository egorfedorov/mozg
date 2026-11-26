/**
 * Every sentence a reader sees goes through `t()`.
 *
 * English is the source and the key: a translation is looked up by the
 * normalised English sentence, and falls back to English itself. So a page is
 * never broken by a missing translation, and the missing one is always visible
 * in `npm run i18n:check`, which reads every `t("…")` in the source and
 * compares it with what each language has.
 *
 * No React in this file: the server and the hooks build their sentences here
 * too, and they must not pull a UI framework into a hook.
 *
 * The current language is one value for the whole process. That is enough
 * because every process has one reader: a hook sets it once from the person's
 * settings, the desk server speaks one language, and the site sets it at the
 * top of each page it renders.
 */

/** The languages the site is offered in. English is the source. */
export type Lang = "en" | "de" | "es" | "fr" | "zh" | "zh-tw" | "it" | "nl" | "pt" | "ja" | "ko" | "ru" | "tr";

export const LANGS: readonly Lang[] = ["en", "de", "es", "fr", "zh", "zh-tw", "it", "nl", "pt", "ja", "ko", "ru", "tr"];

/** Each language as it names itself, for the picker: never translated. */
export const LANG_NAME: Record<Lang, string> = {
  en: "English",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  zh: "简体中文",
  "zh-tw": "繁體中文",
  it: "Italiano",
  nl: "Nederlands",
  pt: "Português",
  ja: "日本語",
  ko: "한국어",
  ru: "Русский",
  tr: "Türkçe",
};

/** The value of a `lang` attribute and of an hreflang link. */
export const LANG_TAG: Record<Lang, string> = {
  en: "en",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
  zh: "zh-CN",
  "zh-tw": "zh-TW",
  it: "it-IT",
  nl: "nl-NL",
  pt: "pt-BR",
  ja: "ja-JP",
  ko: "ko-KR",
  ru: "ru-RU",
  tr: "tr-TR",
};

/** How a language says "language", for the picker's own label. */
export const LANG_LABEL: Record<Lang, string> = {
  en: "Language",
  de: "Sprache",
  es: "Idioma",
  fr: "Langue",
  zh: "语言",
  "zh-tw": "語言",
  it: "Lingua",
  nl: "Taal",
  pt: "Idioma",
  ja: "言語",
  ko: "언어",
  ru: "Язык",
  tr: "Dil",
};

/** A short name for narrow screens. */
export const LANG_SHORT: Record<Lang, string> = {
  en: "EN",
  de: "DE",
  es: "ES",
  fr: "FR",
  zh: "简",
  "zh-tw": "繁",
  it: "IT",
  nl: "NL",
  pt: "PT",
  ja: "日",
  ko: "한",
  ru: "RU",
  tr: "TR",
};

/**
 * The forms a counted noun takes. English has two; Russian needs four;
 * Chinese, Japanese and Korean get by with one. A translation of a counted
 * sentence may be one string, or this table when the language needs more
 * forms than English has.
 */
export type PluralCategory = "one" | "few" | "many" | "other";
export type Plural = Partial<Record<PluralCategory, string>>;
export type Dictionary = Record<string, string | Plural>;

const dictionaries = new Map<Lang, Dictionary>();
let current: Lang = "en";

/** Put a language's translations on record. Called once per dictionary at load. */
export function registerDictionary(lang: Lang, dictionary: Dictionary): void {
  dictionaries.set(lang, { ...(dictionaries.get(lang) ?? {}), ...dictionary });
}

/** Speak this language from now on, in this process. */
export function setLanguage(lang: Lang): void {
  current = LANGS.includes(lang) ? lang : "en";
}

export function getLanguage(): Lang {
  return current;
}

/** True when a string names one of our languages. */
export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGS as readonly string[]).includes(value);
}

/** The language a browser or an operating system asks for, narrowed to ours. */
export function languageOf(tag: string | null | undefined): Lang {
  if (!tag) return "en";
  const low = tag.toLowerCase();
  if (low.startsWith("zh")) return /tw|hk|mo|hant/.test(low) ? "zh-tw" : "zh";
  const base = low.split(/[-_]/)[0];
  return (LANGS as readonly string[]).includes(base) ? (base as Lang) : "en";
}

/** Which form of a counted noun a number takes. Whole numbers only. */
export function pluralCategory(lang: Lang, n: number): PluralCategory {
  if (lang === "zh" || lang === "zh-tw" || lang === "ja" || lang === "ko") return "other";
  if (lang === "ru") {
    const ten = Math.abs(n) % 10;
    const hundred = Math.abs(n) % 100;
    if (ten === 1 && hundred !== 11) return "one";
    if (ten >= 2 && ten <= 4 && !(hundred >= 12 && hundred <= 14)) return "few";
    return "many";
  }
  if (lang === "fr") return n === 0 || n === 1 ? "one" : "other";
  return n === 1 ? "one" : "other";
}

/** The form of a sentence both the source and a translation are keyed by. */
export function normalize(english: string): string {
  return english.trim().replace(/\s+/g, " ");
}

function lookup(lang: Lang, english: string): string | Plural | undefined {
  return dictionaries.get(lang)?.[normalize(english)];
}

export function t(english: string): string {
  if (current === "en") return english;
  const hit = lookup(current, english);
  if (typeof hit === "string") return hit;
  return hit?.other ?? english;
}

/**
 * Marks an English sentence that lives in data rather than in JSX: the label
 * of a kind of card, the name of a part of the desk. It is translated with
 * `t()`, where it is shown.
 *
 * It returns the sentence as it is. A table at the top of a module is made
 * once, when the module is first loaded, and in whatever language happened to
 * be current then. To translate there was to bake one language's words into
 * the key, and so into every other language's page.
 */
export function msg(english: string): string {
  return english;
}

/**
 * Sentences side by side, as the language writes them: a space between two,
 * unless the one before ends in a full stop that carries its own room.
 *
 *   sentences("変更が入りました。", "説明返しをどうぞ。")
 */
export function sentences(...parts: string[]): string {
  return parts.join(" ").replace(/。 /g, "。");
}

/**
 * Numbered slots for places that need a plain string: `alt`, `aria-label`,
 * `title`, a card's text, and data that is not JSX.
 *
 *   fill("Ownership today: <0/>%", [48])
 */
export function fill(sentence: string, slots: (string | number)[]): string {
  return sentence.replace(/<(\d+)\/>/g, (_, i: string) => {
    const slot = slots[Number(i)];
    return slot === undefined ? "" : String(slot);
  });
}

/**
 * Count something in a sentence, by choosing whole sentences, never a suffix.
 *
 * English picks between `one` and `many`. Another language gets three ways to
 * be right: translate both English sentences; give `many` as a table of forms
 * when it has more than English ("1 изменение, 2 изменения, 5 изменений");
 * or let both fall back to one neutral sentence.
 */
export function count(n: number, one: string, many: string): string {
  // Only the counted slot is filled here. A sentence may carry another
  // ("<1/> of the <0/> modules"), and that one is the caller's to fill.
  const counted = (sentence: string) => sentence.replace(/<0\/>/g, String(n));
  if (current === "en") return counted(n === 1 ? one : many);
  const category = pluralCategory(current, n);
  const single = lookup(current, one);
  const plural = lookup(current, many);
  if (category === "one") {
    if (single && typeof single !== "string") return counted(single.one ?? single.other ?? one);
    return counted(typeof single === "string" ? single : one);
  }
  if (plural && typeof plural !== "string") return counted(plural[category] ?? plural.other ?? many);
  return counted(typeof plural === "string" ? plural : (typeof single === "string" ? single : many));
}
