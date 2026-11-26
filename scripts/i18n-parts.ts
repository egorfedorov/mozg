/**
 * Translation in small parts, for a language translated with a helper.
 *
 * A helper asked for a whole dictionary in one go, 441 long keys and all,
 * loses its place before the end, and the file comes out unreadable. So it
 * writes no keys and no dictionary. It writes the translations alone, a batch
 * at a time, and this puts each one under its sentence.
 *
 *   npm run i18n:parts -- make de messages
 *     .i18n-parts/de/messages/00.en.txt    the index, a tab, the English sentence
 *     .i18n-parts/de/messages/00.txt       the index, a tab, the translation
 *   npm run i18n:parts -- merge de messages
 *     every translation that could be shown goes into the dictionary, and each
 *     of the others is named with its line, to be done again
 *
 * The index is the sentence's place in the English list. It does not move
 * while the English does not, so a batch stays right whatever else was merged
 * before it. A line is refused on its own, for its own reason: not a line of
 * the batch, empty, a `<0/>` lost, or the English itself. The rest of the
 * batch stands.
 *
 * `merge` makes the dictionary again whole each time, in the order of the
 * source: what the parts gave, then what the dictionary already had that
 * could be shown (a table of forms for a counted word included), then an
 * empty value. So a dictionary that was corrupted is repaired by merging.
 */

import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");

type Surface = "messages" | "docs" | "operator";

/** The numbered slots of a sentence, in order: "<1/> of <0/>" → "0,1". */
const slots = (text: string): string => [...text.matchAll(/<(\d+)\/>/g)].map((m) => m[1]).sort().join(",");
const normal = (key: string): string => key.trim().replace(/\s+/g, " ");

/** The words of a sentence, a slot not counted: "<0/> modules." is one word long. */
const wordsOf = (text: string): number => text.replace(/<\d+\/>/g, " ").split(/\s+/).filter(Boolean).length;
/** Every sentence of the English side, in order, with the file that first asks for it. From the check, which reads the source. */
function english(): Record<Surface, string[][]> {
  const out = execFileSync("npx", ["tsx", "scripts/i18n-check.ts", "--keys"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out) as Record<Surface, string[][]>;
}

const BATCH = /^\d\d\.txt$/;
/** No batch has more sentences than this, however short they are. */
const LINES = 100;

/** What the dictionary of a language already has that could be shown, by normalised English sentence. */
async function alreadyShown(lang: string, surface: Surface): Promise<Map<string, string | Record<string, string>>> {
  const file = join(src, "i18n", surface, `${lang}.ts`);
  const out = new Map<string, string | Record<string, string>>();
  try {
    const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
    const dict = (mod.default ?? mod[lang.replaceAll("-", "_")] ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(dict)) {
      if (typeof value === "string" ? value.trim() !== "" : value && typeof value === "object") out.set(normal(key), value as string | Record<string, string>);
    }
  } catch {
    /* not there, or not readable: it has nothing to show, and merge makes it again */
  }
  return out;
}

async function make(lang: string, surface: Surface, budget: number): Promise<void> {
  const keys = english()[surface];
  const dir = join(root, ".i18n-parts", lang, surface);
  await mkdir(dir, { recursive: true });
  // Only what the dictionary has not got: a second round, after the English
  // changed, lays out the difference and nothing more.
  const have = await alreadyShown(lang, surface);
  const still = new Set(keys.map(([key]) => normal(key)));
  const files = (await readdir(dir).catch(() => [])) as string[];

  // What an earlier round left. A translation goes once nothing in it is
  // wanted any more: merged, or the English no longer has it. One that still
  // holds a sentence the dictionary lacks stops everything here, with its
  // input beside it: a new batch must never be laid over an old pair.
  for (const name of files.filter((f) => BATCH.test(f))) {
    const input = join(dir, `${name.slice(0, 2)}.en.txt`);
    const lines = (await readFile(input, "utf8").catch(() => "")).split("\n").filter(Boolean);
    const wanted = lines.map((line) => normal(line.slice(line.indexOf("\t") + 1))).filter((sentence) => still.has(sentence));
    const left = wanted.filter((sentence) => !have.has(sentence));
    if (left.length) {
      process.stdout.write(`${lang} ${surface}: ${name} still holds ${left.length} sentence(s) that are not in the dictionary. Merge before making more.\n`);
      return;
    }
    await rm(join(dir, name), { force: true });
    await rm(input, { force: true });
  }

  const open = keys.map(([key], index) => (have.has(normal(key)) ? -1 : index)).filter((index) => index >= 0);

  // Batches are cut by characters of English, so that none is a long one to
  // write, and by lines too: a hundred short sentences are as long as any.
  const batches: number[][] = [];
  let size = 0;
  for (const index of open) {
    if (!batches.length || size + keys[index][0].length > budget || batches[batches.length - 1].length >= LINES) {
      batches.push([]);
      size = 0;
    }
    batches[batches.length - 1].push(index);
    size += keys[index][0].length + 12;
  }
  const inputs = batches.map((_, n) => `${String(n).padStart(2, "0")}.en.txt`);
  for (const [n, indices] of batches.entries()) {
    await writeFile(join(dir, inputs[n]), indices.map((index) => `${index}\t${keys[index][0]}`).join("\n") + "\n");
  }
  // An input that is not laid out now goes: its translation, if there was one, went above.
  for (const file of files) if (file.endsWith(".en.txt") && !inputs.includes(file)) await rm(join(dir, file), { force: true });
  process.stdout.write(
    open.length
      ? `${lang} ${surface}: ${open.length} of ${keys.length} sentences to translate, in ${batches.length} batches (${batches.map((b) => b.length).join(" + ")}), in .i18n-parts/${lang}/${surface}/\n`
      : `${lang} ${surface}: nothing to translate. ${keys.length} sentences are in the dictionary.\n`,
  );
}

async function merge(lang: string, surface: Surface): Promise<void> {
  const keys = english()[surface];
  const dir = join(root, ".i18n-parts", lang, surface);
  const file = join(src, "i18n", surface, `${lang}.ts`);
  const name = lang.replaceAll("-", "_");

  // By the English sentence, never by its place in today's list.
  const values = new Map<string, string>();
  let accepted = 0;
  let refused = 0;
  const stillEnglish = new Set(keys.map(([sentence]) => sentence));
  for (const part of ((await readdir(dir).catch(() => [])) as string[]).filter((f) => BATCH.test(f)).sort()) {
    const batch = part.slice(0, 2);
    // The batch's own English, by index: the sentence each translation was
    // written for. It is read from the batch and not from today's source, so
    // that a sentence added to the source since moves nothing.
    const englishOf = new Map(
      (await readFile(join(dir, `${batch}.en.txt`), "utf8").catch(() => ""))
        .split("\n")
        .filter(Boolean)
        .map((line) => [Number(line.slice(0, line.indexOf("\t"))), line.slice(line.indexOf("\t") + 1)] as const),
    );
    // A line is an index, whitespace, the translation. A line that starts with
    // neither is taken for the rest of the sentence before it: wrapped by
    // mistake, which is no reason to lose it.
    const entries: { index: number; text: string }[] = [];
    const stray: number[] = [];
    (await readFile(join(dir, part), "utf8"))
      .split("\n")
      .forEach((raw, n) => {
        const line = raw.trimEnd();
        if (!line.trim()) return;
        const m = /^(\d+)\s+(.*)$/.exec(line);
        if (m) entries.push({ index: Number(m[1]), text: m[2] });
        else if (entries.length) entries[entries.length - 1].text += ` ${line.trim()}`;
        else stray.push(n + 1);
      });
    for (const n of stray) {
      refused++;
      process.stdout.write(`  ${lang} ${surface} ${part}:${n}, refused (no index at the start): ${"\u2026"}\n`);
    }
    const seen = new Set<number>();
    for (const { index, text: raw } of entries) {
      const text = raw.trim().replace(/^(["“«'])(.*)\1$/u, "$2").trim();
      const key = englishOf.get(index) ?? "";
      const why = !englishOf.has(index)
        ? `not a sentence of batch ${batch}`
        : seen.has(index)
          ? "the index twice"
          : !text
            ? "empty"
            : slots(text) !== slots(key)
              ? "a <N/> slot differs from the English"
              : text === key && wordsOf(key) >= 3
                ? "left as the English"
                : !stillEnglish.has(key)
                  ? "of a sentence the English no longer has"
                  : null;
      seen.add(index);
      if (why) {
        refused++;
        process.stdout.write(`  ${lang} ${surface} ${part}, refused (${why}): ${String(key || raw).slice(0, 100)}\n`);
        continue;
      }
      values.set(normal(key), text);
      accepted++;
    }
  }

  // What the dictionary already had that could be shown.
  const existing = await alreadyShown(lang, surface);

  const lines = [
    `import type { Dictionary } from "@/lib/i18n";`,
    ``,
    `/**`,
    ` * ${surface === "docs" ? "The documentation" : surface === "operator" ? "The operator's panel" : "Everything a reader sees outside the documentation"}, in ${lang}.`,
    ` *`,
    ` * The key is the English sentence; the value is this language's. A value may`,
    ` * also be a table of forms of a counted word ({ one, few, many, other }) where`,
    ` * the language has more forms than English does.`,
    ` */`,
    `export const ${name}: Dictionary = {`,
  ];
  let lastFile = "";
  let shown = 0;
  keys.forEach(([key, where]) => {
    if (where !== lastFile) {
      lastFile = where;
      lines.push(``, `  // ${where}`);
    }
    const value = values.get(normal(key)) ?? existing.get(normal(key));
    if (value !== undefined && value !== "") shown++;
    lines.push(`  ${JSON.stringify(key)}: ${value === undefined || value === "" ? '""' : JSON.stringify(value)},`);
  });
  lines.push(`};`, ``, `export default ${name};`, ``);
  await writeFile(`${file}.${process.pid}.tmp`, lines.join("\n"));
  await rename(`${file}.${process.pid}.tmp`, file);
  process.stdout.write(`${lang} ${surface}: ${shown} of ${keys.length} sentences translated (this time ${accepted} taken from the parts, ${refused} refused); ${keys.length - shown} to do\n`);
}

const [verb, lang, surfaceArg, budgetArg] = process.argv.slice(2);
const surface: Surface = surfaceArg === "docs" || surfaceArg === "operator" ? surfaceArg : "messages";
if ((verb !== "make" && verb !== "merge") || !lang) {
  process.stdout.write("use: npm run i18n:parts -- make|merge <lang> [messages|docs|operator] [characters of English per batch]\n");
  process.exit(2);
}
if (verb === "make") await make(lang, surface, Number(budgetArg) || 6000);
else await merge(lang, surface);
