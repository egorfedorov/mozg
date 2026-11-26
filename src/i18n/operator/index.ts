/**
 * The dictionaries of the operator's panel.
 *
 * MADE by `npm run i18n:check`: it lists a language here on the day its last
 * sentence is done, and takes it out the day one goes missing. Do not edit:
 * translate, and run the check.
 *
 * The plugin bundles the messages and none of the others.
 */
import { registerDictionary, type Dictionary, type Lang } from "@/lib/i18n";
import ru from "./ru";

/** Every language that has a dictionary here, English excepted. */
export const OPERATOR: Partial<Record<Lang, Dictionary>> = {
  "ru": ru,
};

/** English, and every language with a dictionary here. */
export const OPERATOR_LANGS: Lang[] = ["en", ...Object.keys(OPERATOR).filter((lang): lang is Lang => Boolean(OPERATOR[lang as Lang]))];

for (const [lang, dictionary] of Object.entries(OPERATOR)) {
  if (dictionary) registerDictionary(lang as Lang, dictionary);
}
