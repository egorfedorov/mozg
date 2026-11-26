/**
 * What is translated, and what is not.
 *
 * Reads every sentence the source asks for: each `t("…")`, `msg("…")`, the two
 * sentences of each `count(…)`, and every double-quoted string under
 * src/content. Compares them with what each language has. A sentence nobody
 * translated falls back to English on the page, which is right; here it is
 * listed, so it is seen.
 *
 *   npm run i18n:check                       the table, and coverage.generated.ts
 *   npm run i18n:check -- --skeleton de      empty dictionaries to translate into
 *   npm run i18n:check -- --built out        also opens the built pages: a finished
 *                                            language has a home page in its own
 *                                            language, an unfinished one has no pages
 *   npm run i18n:check -- --quiet            the table alone, without what is left
 *                                            to do; it is what a build and a pack run
 *   npm run i18n:check -- --strict            fails when a language that was complete
 *                                            is not any more. Run before a build
 *   npm run i18n:check -- --todo              the sentences still to translate, as
 *                                            JSON, for each language that has any
 *   npm run i18n:check -- --mend [--write]    a translation filed under a mistyped
 *                                            key is named with the sentence it was
 *                                            written for; --write files it there
 *
 * A translation counts only if it could be shown: it has the same numbered
 * slots as its English (`<0/>`, `<1/>`), it is not empty, and it is not the
 * English sentence itself.
 *
 * Three surfaces are counted apart. "messages" is everything a reader sees
 * outside the documentation; the plugin bundles only that. "docs" is the
 * documentation. A language is offered for either only at full coverage.
 * "operator" is the operator's panel: it has the languages given to it, and
 * gates nothing (make it with `--skeleton xx --surface operator`).
 *
 * And a language never leaves the site by accident. The first time one is
 * complete on a surface, the check writes it to src/i18n/offered.json, and
 * from then on only adds to that file. When a sentence of that language later
 * loses its translation, because the English changed, the build stops and
 * counts what is left, until it is translated or the language is taken out of
 * the file by hand.
 */

import { readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { finished, writeIndexes } from "./i18n-index";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");
const built = process.argv.includes("--built") ? process.argv[process.argv.indexOf("--built") + 1] : null;
const skeleton = process.argv.includes("--skeleton") ? process.argv[process.argv.indexOf("--skeleton") + 1] : null;
/** With --skeleton: only that surface. The panel's dictionary is not every visitor's. */
const onlySurface = process.argv.includes("--surface") ? (process.argv[process.argv.indexOf("--surface") + 1] as Surface) : null;
/** With --skeleton: empty a dictionary that already has translations. Never by accident. */
const force = process.argv.includes("--force");
/** The table alone, without the sentences left to do. For a build and a pack. */
const quiet = process.argv.includes("--quiet");
/** A language that was complete and is not any more stops the run. Before a build. */
const strict = process.argv.includes("--strict");
/** Only the sentences left to translate, as JSON, and nothing written. */
const todo = process.argv.includes("--todo");
/** Names each translation that sits under a mistyped key, and the sentence it was written for. */
const mend = process.argv.includes("--mend");
/** With --mend: files them under their sentences. Nothing else is ever written to a dictionary. */
const write = process.argv.includes("--write");

type Surface = "messages" | "docs" | "operator";
/** What a visitor reads. A language is offered on the site when both are complete. */
const SITE: ("messages" | "docs")[] = ["messages", "docs"];
/** What only the operator reads. It has the languages the operator wants, and gates nothing. */
const SURFACES: Surface[] = ["messages", "docs", "operator"];

async function filesIn(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const name of await readdir(dir)) {
    const path = join(dir, name);
    if ((await stat(path)).isDirectory()) out.push(...(await filesIn(path)));
    else out.push(path);
  }
  return out;
}

function surfaceOf(path: string): Surface | null {
  const rel = path.slice(src.length + 1).replaceAll("\\", "/");
  if (rel.startsWith("i18n/") || rel.endsWith(".test.ts") || rel.endsWith(".d.ts") || rel.includes("/coverage.generated")) return null;
  if (rel.includes("/docs/") || rel.includes("content/docs")) return "docs";
  // The operator's panel speaks its own languages: not every one a visitor may.
  if (rel.startsWith("admin/") || rel.includes("/admin/")) return "operator";
  return "messages";
}

/**
 * The code without its comments. A comment that shows a call, `t("…")` in a
 * sentence of prose, is not a sentence anybody will read on a page.
 */
function withoutComments(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i++;
    } else if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end < 0 ? source.length : end + 2;
    } else if (c === '"' || c === "'" || c === "`") {
      // A string is kept as it is, comment marks inside it included.
      let j = i + 1;
      while (j < source.length && source[j] !== c) {
        if (source[j] === "\\") j++;
        j++;
      }
      out += source.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** A string literal as TypeScript would have it. Null when it is not one. */
function literal(raw: string): string | null {
  if (raw.includes("${")) return null;
  try {
    if (raw.startsWith('"')) return JSON.parse(raw) as string;
    return raw.slice(1, -1).replace(/\\(.)/g, "$1");
  } catch {
    return null;
  }
}

/**
 * `t`, `msg` and `count` are found by their names. Imported under another
 * one, every sentence behind them is invisible: it is never laid out for a
 * translation, and no check misses it. So it is named, and the run stops.
 */
function renamed(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/\bimport\s*\{([^}]*)\}\s*from\s*["'][^"']*\/i18n[^"']*["']/g)) {
    for (const one of m[1].split(",")) {
      const alias = /^\s*(?:type\s+)?(t|msg|count|fill)\s+as\s+(\w+)\s*$/.exec(one);
      if (alias) out.push(`${alias[1]} as ${alias[2]}`);
    }
  }
  return out;
}

/** Every sentence the source asks for, with the files that ask; and the imports that would hide some. */
async function asked(): Promise<{ keys: Record<Surface, Map<string, string[]>>; hidden: string[] }> {
  const hidden: string[] = [];
  // A string literal in either kind of quote, or a template with nothing in
  // it to interpolate. Written as a literal: assembled from pieces, it is too
  // easy to get a bracket wrong and match nothing at all.
  const LIT = /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)/;
  const CALL = new RegExp(String.raw`\b(?:t|msg)\(\s*(${LIT.source})`, "g");
  const COUNT = new RegExp(String.raw`\bcount\(\s*[^,()]+,\s*(${LIT.source})\s*,\s*(${LIT.source})`, "g");
  const out: Record<Surface, Map<string, string[]>> = { messages: new Map(), docs: new Map(), operator: new Map() };
  for (const path of await filesIn(src)) {
    const surface = surfaceOf(path);
    if (!surface) continue;
    const text = withoutComments(await readFile(path, "utf8"));
    for (const one of renamed(text)) hidden.push(`${path.slice(src.length + 1)}: ${one}`);
    const add = (key: string) => {
      const norm = key.trim().replace(/\s+/g, " ");
      if (!norm) return;
      out[surface].set(norm, [...(out[surface].get(norm) ?? []), path.slice(src.length + 1)]);
    };
    // Content has one rule and no calls: a string in double quotes is a
    // sentence, and one in single quotes is a name, a path or a kind.
    if (path.startsWith(join(src, "content"))) {
      for (const m of text.replace(/^import .*$/gm, "").matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) add(m[1].replace(/\\(.)/g, "$1"));
      continue;
    }
    for (const m of text.matchAll(CALL)) {
      const key = literal(m[1]);
      if (key !== null) add(key);
    }
    for (const m of text.matchAll(COUNT)) {
      for (const raw of [m[2], m[3]]) {
        const key = literal(raw);
        if (key !== null) add(key);
      }
    }
  }
  return { keys: out, hidden };
}

/** The numbered slots of a sentence, in order: "<1/> of <0/>" → "0,1". */
const slots = (text: string): string => [...text.matchAll(/<(\d+)\/>/g)].map((m) => m[1]).sort().join(",");

/** How far two sentences are apart: the edits between them over the length of the longer one. */
function distance(a: string, b: string): number {
  let last = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(last[j] + 1, row[j - 1] + 1, last[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    last = row;
  }
  return last[b.length] / Math.max(a.length, b.length, 1);
}

/**
 * The sentence a mistyped key was written for: the one without a translation
 * that it is nearest to, when it is near enough for that to be no coincidence
 * and nearer to it than to any other by a clear margin. Null when in doubt.
 */
function meantFor(orphan: string, missing: string[]): string | null {
  let best: string | null = null;
  let bestAt = 1;
  let nextAt = 1;
  for (const key of missing) {
    const at = distance(orphan, key);
    if (at < bestAt) [nextAt, best, bestAt] = [bestAt, key, at];
    else if (at < nextAt) nextAt = at;
  }
  // A short sentence has little to go wrong in: one letter in "Gentle" is a fifth of it.
  const near = Math.max(2 / orphan.length, 0.12);
  return best !== null && bestAt <= near && nextAt - bestAt >= 0.08 ? best : null;
}

interface Translated {
  /** The English sentences a language has, each translated. */
  keys: Map<string, number>;
  /** Left as it is in English, which is the same as not translated. */
  untranslated: string[];
  /** Unreadable as a translation: a slot lost or added, a form that is not a sentence. */
  broken: string[];
}

/** The words of one language's dictionaries, and the English keys they translate. */
async function translated(surface: Surface): Promise<Map<string, Translated>> {
  const dir = join(src, "i18n", surface);
  const out = new Map<string, Translated>();
  for (const file of (await readdir(dir).catch(() => [])) as string[]) {
    const lang = file.replace(/\.ts$/, "");
    if (lang === "index" || lang === "en") continue;
    let mod: Record<string, unknown>;
    try {
      mod = (await import(`${dir}/${file}`)) as Record<string, unknown>;
    } catch (err) {
      // One dictionary that cannot be read must not hide what the others have done.
      process.stdout.write(`  ${lang} ${surface}: cannot be read as TypeScript, so it is counted as empty (${err instanceof Error ? (err.message.split("\n")[0] ?? "").slice(0, 110) : String(err)})\n`);
      continue;
    }
    const dict = (mod.default ?? mod[lang] ?? Object.values(mod).find((v) => v && typeof v === "object")) as Record<string, unknown>;
    if (!dict) throw new Error(`${file} does not export a dictionary`);
    const one: Translated = { keys: new Map(), untranslated: [], broken: [] };
    for (const [key, value] of Object.entries(dict)) {
      const norm = key.trim().replace(/\s+/g, " ");
      if (typeof value !== "string" && (typeof value !== "object" || value === null)) throw new Error(`${file}: "${key}" is neither a sentence nor a table of forms`);
      const forms = typeof value === "string" ? [value] : Object.values(value as Record<string, unknown>);
      const words = forms.filter((v): v is string => typeof v === "string");
      // An empty translation is a missing one.
      if (!words.length || words.every((w) => !w.trim())) continue;
      if (words.length !== forms.length || words.some((w) => slots(w) !== slots(norm))) {
        one.broken.push(key);
        continue;
      }
      // Three words or more, a slot not counted, exactly as in English: nobody
      // translated this. "in <0/> modules." is two words, and is Dutch as well.
      if (words.length === 1 && words[0].trim() === norm && norm.replace(/<\d+\/>/g, " ").split(/\s+/).filter(Boolean).length >= 3) {
        one.untranslated.push(key);
        continue;
      }
      one.keys.set(norm, (one.keys.get(norm) ?? 0) + 1);
    }
    out.set(lang, one);
  }
  return out;
}

/**
 * True when the file is not there, or is still an empty skeleton: every entry
 * ends in `: "",`. A dictionary with one translated sentence in it is work.
 */
async function isEmptySkeleton(file: string): Promise<boolean> {
  const text = await readFile(file, "utf8").catch(() => null);
  if (text === null) return true;
  return !/^\s+"(?:[^"\\]|\\.)*"\s*:\s*(?!"",?\s*$)\S/m.test(text);
}

/** A skeleton to translate into: every sentence of a surface, in the order of the source, with nothing translated. */
async function writeSkeleton(lang: string, keys: Record<Surface, Map<string, string[]>>, surfaces: Surface[] = SITE): Promise<void> {
  const name = lang.replaceAll("-", "_");
  for (const surface of surfaces) {
    const target = join(src, "i18n", surface, `${lang}.ts`);
    // Two people may work on one language, one per surface, and each may make
    // the skeleton. The second one must not empty what the first has written.
    if (!force && !(await isEmptySkeleton(target))) {
      throw new Error(`${target} already has translations. --skeleton ${lang} empties both of the language's dictionaries; pass --force to do that on purpose.`);
    }
    const lines: string[] = [
      `import type { Dictionary } from "@/lib/i18n";`,
      ``,
      `/**`,
      ` * ${surface === "docs" ? "The documentation" : "Everything a reader sees outside the documentation"}, in ${lang}.`,
      ` * Made by \`npm run i18n:check -- --skeleton ${lang}\` and then translated by hand.`,
      ` *`,
      ` * The key is the English sentence; the value is this language's. A value may`,
      ` * also be a table of forms of a counted word ({ one, few, many, other }) where`,
      ` * the language has more forms than English does.`,
      ` */`,
      `export const ${name}: Dictionary = {`,
    ];
    let file = "";
    for (const [key, where] of keys[surface]) {
      if (where[0] !== file) {
        file = where[0];
        lines.push(``, `  // ${file}`);
      }
      lines.push(`  ${JSON.stringify(key)}: "",`);
    }
    lines.push(`};`, ``, `export default ${name};`, ``);
    await writeFile(target, lines.join("\n"));
    process.stdout.write(`wrote src/i18n/${surface}/${lang}.ts with ${keys[surface].size} sentences\n`);
  }
}

async function main(): Promise<number> {
  // To stderr: `--keys` is read as JSON by scripts/i18n-parts.ts, which must
  // not lay out a batch with a sentence missing from it.
  const { keys, hidden } = await asked();
  if (hidden.length) {
    process.stderr.write("t, msg and count are found by their names, and these are imported under another one:\n");
    for (const one of hidden) process.stderr.write(`  ${one}\n`);
    process.stderr.write("  Every sentence behind them would never be laid out for a translation, and nothing would miss it. Import them by their names.\n");
    return 1;
  }

  // Every sentence in the order of the source, and the file that first asks
  // for it: what scripts/i18n-parts.ts lays out into batches.
  if (process.argv.includes("--keys")) {
    const listed = (surface: Surface) => [...keys[surface]].map(([key, where]) => [key, where[0]]);
    process.stdout.write(`${JSON.stringify({ messages: listed("messages"), docs: listed("docs"), operator: listed("operator") })}\n`);
    return 0;
  }

  // The skeleton is written before any dictionary is read: it must be possible
  // to make it again over an old one.
  if (skeleton && skeleton !== "en") await writeSkeleton(skeleton, keys, onlySurface ? [onlySurface] : SITE);

  const tables: Record<Surface, Map<string, Translated>> = { messages: await translated("messages"), docs: await translated("docs"), operator: await translated("operator") };

  // What is left, for whoever translates it next: the sentences themselves.
  if (todo) {
    const left: Record<string, Partial<Record<Surface, string[]>>> = {};
    for (const lang of [...new Set([...tables.messages.keys(), ...tables.docs.keys()])].sort()) {
      for (const surface of SURFACES) {
        const missing = [...keys[surface].keys()].filter((key) => !tables[surface].get(lang)?.keys.has(key));
        if (missing.length) (left[lang] ??= {})[surface] = missing;
      }
    }
    process.stdout.write(`${JSON.stringify(left, null, 2)}\n`);
    return 0;
  }

  const langs = new Set<string>();
  for (const surface of SURFACES) for (const lang of tables[surface].keys()) langs.add(lang);

  const coverage: Record<string, Partial<Record<Surface, number>>> = {};
  const pct = (a: number, b: number) => (b ? a / b : 1);
  process.stdout.write(`\n${"language".padEnd(9)}${"site".padEnd(12)}${"docs".padEnd(12)}${"panel".padEnd(12)}offered\n`);
  for (const surface of SURFACES) process.stdout.write(`         ${keys[surface].size} sentences on the English side (${surface})\n`);

  for (const lang of [...langs].sort()) {
    const cells: string[] = [];
    const offered: string[] = [];
    coverage[lang] = { messages: 0, docs: 0 };
    for (const surface of SURFACES) {
      const have = tables[surface].get(lang);
      const want = [...keys[surface].keys()];
      if (!have) {
        cells.push("-".padEnd(12));
        continue;
      }
      const done = want.filter((k) => have.keys.has(k)).length;
      coverage[lang][surface] = pct(done, want.length);
      cells.push(`${done}/${want.length}`.padEnd(12));
      // The panel gates nothing: a language is offered on the site for the visitor's two alone.
      if ((SITE as readonly Surface[]).includes(surface) && coverage[lang][surface] === 1) offered.push(surface === "docs" ? "docs" : "site");
      const orphans = [...have.keys.keys()].filter((k) => !keys[surface].has(k));
      const missing = want.filter((k) => !have.keys.has(k));
      // A translation filed under a mistyped key is put under its sentence.
      // Printed first; filed only with --write.
      let moved = 0;
      if (mend && orphans.length && missing.length) {
        const file = join(src, "i18n", surface, `${lang}.ts`);
        let text: string | null = null;
        for (const orphan of orphans) {
          const key = meantFor(orphan, missing);
          if (!key) continue;
          const pattern = new RegExp(`^  "${JSON.stringify(orphan).slice(1, -1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}":`, "gm");
          text ??= await readFile(file, "utf8");
          if ([...text.matchAll(pattern)].length !== 1) {
            process.stdout.write(`  ${lang} ${surface}: "${orphan.slice(0, 60)}" reads like "${key.slice(0, 60)}", but is not in the file once\n`);
            continue;
          }
          process.stdout.write(`  ${lang} ${surface}${write ? ", filed under" : " would be filed under"} "${key.slice(0, 80)}": was "${orphan.slice(0, 80)}"\n`);
          if (write) text = text.replace(pattern, () => `  ${JSON.stringify(key)}:`);
          missing.splice(missing.indexOf(key), 1);
          moved++;
        }
        if (text !== null && write) {
          await writeFile(`${file}.${process.pid}.tmp`, text);
          await rename(`${file}.${process.pid}.tmp`, file);
        }
      }
      // What is left to do, for the person translating it. A build or a pack
      // passes --quiet and gets the table alone.
      if (!quiet) {
        for (const bad of have.broken.slice(0, 4)) process.stdout.write(`  ${lang} ${surface}, slots differ: "${bad.slice(0, 70)}"\n`);
        for (const same of have.untranslated.slice(0, 4)) process.stdout.write(`  ${lang} ${surface}, left in English: "${same.slice(0, 70)}"\n`);
        for (const key of missing.slice(0, 4)) process.stdout.write(`  ${lang} ${surface}, missing: "${key.slice(0, 80)}"\n`);
        const more = have.broken.length + have.untranslated.length + missing.length;
        if (more > 12) process.stdout.write(`  ${lang} ${surface}: … and ${more - 12} more to do\n`);
      }
      if (!quiet && orphans.length > moved) process.stdout.write(`  ${lang} ${surface}: ${orphans.length - moved} translation(s) of sentences that no longer exist${mend ? "" : " (--mend puts a mistyped key right)"}\n`);
    }
    process.stdout.write(`${lang.padEnd(9)}${cells.join("")}${offered.join(" + ") || "not yet"}\n`);
  }

  // Several people may run this at once, one per language. The file the build
  // reads is replaced whole, never written in place.
  const generated = join(src, "i18n", "coverage.generated.ts");
  const text =
    `// Made by \`npm run i18n:check\`. Do not edit: run the check instead.\n` +
    `/** How much of each surface a language has translated, from 0 to 1. The panel is the operator's. */\n` +
    `export const COVERAGE: Record<string, Partial<Record<"messages" | "docs" | "operator", number>>> = ${JSON.stringify(coverage, null, 2)};\n`;
  await writeFile(`${generated}.${process.pid}.tmp`, text);
  await rename(`${generated}.${process.pid}.tmp`, generated);
  // The two index files are made here too, and never by hand.
  await writeIndexes(src, coverage);

  // A language that has been complete once cannot stop being complete
  // unnoticed. offered.json remembers those: this only ever adds to it, and
  // taking a language out is done by hand, on purpose.
  const offeredFile = join(src, "i18n", "offered.json");
  const before = (await readFile(offeredFile, "utf8").then((text) => JSON.parse(text) as Record<(typeof SITE)[number], string[]>).catch(() => null)) ?? { messages: [], docs: [] };
  const now: Record<(typeof SITE)[number], string[]> = { messages: finished(coverage, "messages"), docs: finished(coverage, "docs") };
  const lost = SITE.flatMap((surface) => before[surface].filter((lang) => !now[surface].includes(lang)).map((lang) => ({ lang, surface })));
  if (lost.length) {
    process.stdout.write("\na language that was complete, and is not any more\n");
    for (const { lang, surface } of lost) {
      const have = tables[surface].get(lang);
      process.stdout.write(`  ${lang} ${surface}: ${[...keys[surface].keys()].filter((key) => !have?.keys.has(key)).length} sentence(s) to translate\n`);
    }
    process.stdout.write("  A build stops until they are translated; `npm run i18n:check -- --todo` lists them.\n");
    process.stdout.write("  To stop offering a language on purpose, take it out of src/i18n/offered.json.\n");
  }
  const offered: Record<(typeof SITE)[number], string[]> = {
    messages: [...new Set([...before.messages, ...now.messages])].sort(),
    docs: [...new Set([...before.docs, ...now.docs])].sort(),
  };
  await writeFile(`${offeredFile}.${process.pid}.tmp`, `${JSON.stringify(offered, null, 2)}\n`);
  await rename(`${offeredFile}.${process.pid}.tmp`, offeredFile);
  const stops = lost.length > 0 && (strict || built) ? 1 : 0;

  if (!built) return stops;

  process.stdout.write("\nbuilt pages\n");
  let bad = 0;
  const english = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(await readFile(join(built, "index.html"), "utf8"))?.[1]?.replace(/<[^>]+>/g, "").trim();
  for (const lang of Object.keys(coverage)) {
    const html = await readFile(join(built, lang, "index.html"), "utf8").catch(() => "");
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
    const title = /<html[^>]*\slang="([^"]+)"/.exec(html)?.[1] ?? "";
    // A finished language has a page, in its own language. An unfinished one has none.
    const finished = coverage[lang].messages === 1;
    const ok = finished ? Boolean(h1) && h1 !== english && title !== "" : html === "";
    if (!ok) bad++;
    process.stdout.write(`  ${ok ? "ok " : "BAD"}  ${lang}: ${finished ? `lang="${title}", h1 "${h1.slice(0, 60)}"` : html === "" ? "no pages, as it is unfinished" : "has pages although it is unfinished"}\n`);
  }
  if (bad) process.stdout.write(`  ${bad} page(s) are not as they should be\n`);

  // A link with two slashes in a row names a page that is there on one server
  // and not on another. The first page of the documentation has no slug: it
  // is the folder itself, and a slug joined on anyway made "/de/docs//".
  const doubled: string[] = [];
  for (const path of (await filesIn(built)).filter((p) => p.endsWith(".html"))) {
    for (const m of (await readFile(path, "utf8")).matchAll(/href="([^"]+)"/g)) {
      if (m[1].startsWith("/") && m[1].slice(1).includes("//")) doubled.push(`${path.slice(built.length + 1)} → ${m[1]}`);
    }
  }
  if (doubled.length) {
    process.stdout.write(`\n${doubled.length} link(s) with two slashes in a row\n`);
    for (const one of doubled.slice(0, 8)) process.stdout.write(`  ${one}\n`);
  }
  return bad || doubled.length || stops ? 1 : 0;
}

// The number main returns is the exit code: a build and a pack read it.
main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    process.stderr.write(`i18n check failed: ${err instanceof Error ? err.stack ?? err.message : err}\n`);
    process.exit(1);
  },
);
