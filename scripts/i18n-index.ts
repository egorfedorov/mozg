/**
 * The two index files of the dictionaries, written by the check and never by
 * hand: `src/i18n/messages/index.ts` and `src/i18n/docs/index.ts`.
 *
 * Each lists exactly the languages whose column is complete, so a
 * half-translated language cannot be bundled, picked or routed by mistake. A
 * language appears in them on the day its last sentence is done, and leaves
 * the day one goes missing.
 */

import { rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

type Surface = "messages" | "docs" | "operator";

/** The languages whose column of a surface is complete, in code order. */
export function finished(coverage: Record<string, Partial<Record<Surface, number>>>, surface: Surface): string[] {
  return Object.keys(coverage)
    .filter((lang) => coverage[lang]?.[surface] === 1)
    .sort();
}

/** The text of the index of one surface. */
export function indexFile(surface: Surface, langs: string[]): string {
  const name = surface === "docs" ? "DOCS" : surface === "operator" ? "OPERATOR" : "MESSAGES";
  const what = surface === "docs" ? "the documentation" : surface === "operator" ? "the operator's panel" : "everything a reader sees outside the documentation";
  const imports = langs.map((lang) => `import ${lang.replaceAll("-", "_")} from "./${lang}";`).join("\n");
  const entries = langs.map((lang) => `  "${lang}": ${lang.replaceAll("-", "_")},`).join("\n");
  const listed =
    surface === "docs"
      ? ""
      : `
/** English, and every language with a dictionary here. */
export const ${surface === "operator" ? "OPERATOR_LANGS" : "MESSAGE_LANGS"}: Lang[] = ["en", ...Object.keys(${name}).filter((lang): lang is Lang => Boolean(${name}[lang as Lang]))];`;
  return [
    "/**",
    ` * The dictionaries of ${what}.`,
    " *",
    " * MADE by `npm run i18n:check`: it lists a language here on the day its last",
    " * sentence is done, and takes it out the day one goes missing. Do not edit:",
    " * translate, and run the check.",
    " *",
    " * The plugin bundles the messages and none of the others.",
    " */",
    'import { registerDictionary, type Dictionary, type Lang } from "@/lib/i18n";',
    imports,
    "",
    "/** Every language that has a dictionary here, English excepted. */",
    `export const ${name}: Partial<Record<Lang, Dictionary>> = {`,
    entries,
    "};",
    listed,
    "",
    `for (const [lang, dictionary] of Object.entries(${name})) {`,
    "  if (dictionary) registerDictionary(lang as Lang, dictionary);",
    "}",
    "",
  ].join("\n");
}

/** Write both, each replaced whole so that nothing reads a half-written file. */
export async function writeIndexes(src: string, coverage: Record<string, Partial<Record<Surface, number>>>): Promise<void> {
  for (const surface of ["messages", "docs", "operator"] as const) {
    const file = join(src, "i18n", surface, "index.ts");
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, indexFile(surface, finished(coverage, surface)));
    await rename(tmp, file);
  }
}
