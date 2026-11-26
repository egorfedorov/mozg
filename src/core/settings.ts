/**
 * The settings, as the desk sends them and the store keeps them.
 *
 * Everything the person can change goes through here, so that a value which is
 * not a setting, or not a value a setting can hold, is refused before it is
 * ever written.
 */

import { isLang, languageOf, type Lang } from "@/lib/i18n";
import { DEFAULT_SETTINGS } from "./store";
import type { Settings } from "./types";

/** The language this machine asks for, as far as a process can tell. */
export function systemLanguage(): Lang {
  return languageOf(process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG);
}

/** The language to speak to the person in, from the setting they chose. */
export function languageFor(setting: Settings["language"]): Lang {
  return setting === "system" ? systemLanguage() : setting;
}

const NUDGES: Settings["nudge"][] = ["gentle", "firm", "off"];
/** Enough to hide every project a machine is likely to hold, and no more. */
const HIDDEN_MAX = 50;
const PATH_MAX = 1024;

/**
 * The settings after applying what the desk sent. A field left out keeps its
 * current value. Null when anything sent is not a setting or not a value one
 * can hold: then nothing is written at all.
 */
export function mergeSettings(sent: unknown, current: Settings): Settings | null {
  if (!sent || typeof sent !== "object" || Array.isArray(sent)) return null;
  const v = sent as Record<string, unknown>;
  // A name that is not a setting is refused, not ignored: a control that
  // silently does nothing is the thing this whole file exists to prevent.
  if (Object.keys(v).some((key) => !key.startsWith("$") && !(key in DEFAULT_SETTINGS))) return null;
  const nudge = v.nudge === undefined ? current.nudge : v.nudge;
  const hidden = v.hidden === undefined ? current.hidden : v.hidden;
  const asks = v.asks === undefined ? current.asks : v.asks;
  if (typeof asks !== "boolean") return null;
  const language = v.language === undefined ? current.language : v.language;
  if (language !== "system" && !isLang(language)) return null;
  if (!NUDGES.includes(nudge as Settings["nudge"])) return null;
  if (!Array.isArray(hidden) || hidden.length > HIDDEN_MAX) return null;
  if (hidden.some((h) => typeof h !== "string" || !h.trim() || h.length > PATH_MAX)) return null;
  return { nudge: nudge as Settings["nudge"], asks, language: language as Settings["language"], hidden: [...new Set(hidden as string[])] };
}
