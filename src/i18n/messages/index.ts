/**
 * The dictionaries of everything a reader sees outside the documentation.
 *
 * MADE by `npm run i18n:check`: it lists a language here on the day its last
 * sentence is done, and takes it out the day one goes missing. Do not edit:
 * translate, and run the check.
 *
 * The plugin bundles the messages and none of the others.
 */
import { registerDictionary, type Dictionary, type Lang } from "@/lib/i18n";
import de from "./de";
import es from "./es";
import fr from "./fr";
import it from "./it";
import ja from "./ja";
import ko from "./ko";
import nl from "./nl";
import pt from "./pt";
import ru from "./ru";
import tr from "./tr";
import zh from "./zh";
import zh_tw from "./zh-tw";

/** Every language that has a dictionary here, English excepted. */
export const MESSAGES: Partial<Record<Lang, Dictionary>> = {
  "de": de,
  "es": es,
  "fr": fr,
  "it": it,
  "ja": ja,
  "ko": ko,
  "nl": nl,
  "pt": pt,
  "ru": ru,
  "tr": tr,
  "zh": zh,
  "zh-tw": zh_tw,
};

/** English, and every language with a dictionary here. */
export const MESSAGE_LANGS: Lang[] = ["en", ...Object.keys(MESSAGES).filter((lang): lang is Lang => Boolean(MESSAGES[lang as Lang]))];

for (const [lang, dictionary] of Object.entries(MESSAGES)) {
  if (dictionary) registerDictionary(lang as Lang, dictionary);
}
