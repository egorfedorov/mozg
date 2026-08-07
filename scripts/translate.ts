/**
 * Translate the reading half of the site.
 *
 *   npm run translate                     # report: what is missing, per language
 *   npm run translate -- --lang ru
 *   npm run translate -- --all
 *
 * How it finds the strings: every call to the page-level `t("…")` in
 * src/app/**\/page.tsx and src/components. The English lives in the JSX, so
 * this reads the pages themselves rather than a catalogue somebody has to
 * remember to update — a key that exists in a file nobody translated is a
 * sentence that prints in English, which is the right failure.
 *
 * Keys are a hash of the English (see src/lib/t.ts). Edit a sentence and its
 * translations stop matching; the run below reports them as missing and writes
 * fresh ones, and the stale entries are dropped rather than left to rot.
 *
 * The model gets the whole page's strings in one call, not one call per
 * sentence: a translator who cannot see the paragraph before this one produces
 * twelve sentences that do not follow each other.
 */
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { structured } from "../src/lib/claude";
import { env } from "../src/lib/env";
import { LOCALES, DEFAULT_LOCALE } from "../src/lib/locales";
import { key } from "../src/lib/t";

const ROOTS = ["src/app", "src/components"];
const LOCALES_DIR = "src/locales";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sourceFiles(path)));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) out.push(path);
  }
  return out;
}

/**
 * Pull the argument of every `t("…")` / `t('…')` call.
 *
 * Deliberately a regex and not a parser: the call is always a bare literal by
 * convention (a translated string built at runtime cannot be translated ahead
 * of time anyway), and a TypeScript parse of the whole app to find them would
 * be a dependency for no extra correctness.
 */
function stringsIn(source: string): string[] {
  const out: string[] = [];
  const re = /\bt\(\s*(["'])((?:\\.|(?!\1)[^\\])*)\1\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const text = m[2].replace(/\\n/g, "\n").replace(/\\(["'])/g, "$1");
    if (text.trim()) out.push(text);
  }
  return out;
}

const SCHEMA = {
  type: "object",
  properties: {
    translations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string", description: "The key you were given, unchanged." },
          text: { type: "string", description: "The translation." },
        },
        required: ["key", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["translations"],
  additionalProperties: false,
} as const;

const SYSTEM = `You translate the interface and marketing copy of mozg, a
product that turns documentation into knowledge bases ("brains") that AI agents
read over MCP and that are scored by an exam.

The English is written in a particular voice: plain, concrete, short sentences,
no marketing adjectives, willing to say what the product does NOT do. Keep that
voice. A translation that sounds like a brochure has lost the argument the
English was making.

Rules:
- Keep these untranslated, in Latin script: mozg, MCP, brain_search and every
  other brain_* tool name, and any code, URL or file path.
- "brain", "brains", "pack" and "packs" are PRODUCT NOUNS and stay in Latin
  script, spelled exactly as in the English, in EVERY target language — the
  same treatment as mozg and MCP. Inflect the surrounding grammar around them;
  do not translate them into your language's phrase for a knowledge base, do
  not transliterate them into your script, and never carry over a rendering
  from some other language. A brain is a named thing in this product, not a
  description of one.
- A string containing "\n" is one sentence broken across lines by the layout.
  Translate it as one sentence and keep exactly one "\n", placed where the
  break falls naturally in your language.
- Keep the register informal-but-precise. Address the reader directly if your
  language has that choice.
- Preserve any leading or trailing whitespace, and any punctuation that ends
  the sentence.
- Do not add explanations, do not expand abbreviations, do not "improve" the
  meaning. If a sentence is blunt in English it stays blunt.
- Return every key you were given, exactly once, with the key unchanged.`;

async function translateBatch(
  locale: string,
  native: string,
  items: { key: string; text: string }[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  // Big enough that the model sees the argument of a page, small enough that
  // one bad response does not cost the whole language.
  const BATCH = 20;

  for (let i = 0; i < items.length; i += BATCH) {
    const slice = items.slice(i, i + BATCH);
    const { data } = await structured<{ translations: { key: string; text: string }[] }>({
      model: env.MODEL_TRANSLATE ?? env.MODEL_JUDGE,
      // Generous, and it has to be: a language whose script costs several
      // tokens a character (Chinese, Thai, Hindi) writes far more tokens than
      // the English it came from, and the first run hit the ceiling on ten
      // short strings.
      maxTokens: 16000,
      toolName: "save_translations",
      toolDescription: "Record one translation per string you were given.",
      schema: SCHEMA,
      system: `${SYSTEM}\n\nTranslate into ${native} (${locale}).`,
      content: [
        {
          type: "text",
          text: slice.map((s) => `<s key="${s.key}">${s.text}</s>`).join("\n"),
        },
      ],
    });
    for (const t of data.translations ?? []) {
      if (t.key && t.text) out[t.key] = t.text;
    }
    process.stdout.write(`    ${Math.min(i + BATCH, items.length)}/${items.length}\r`);
  }
  return out;
}

async function main() {
  const only = arg("lang");
  const all = process.argv.includes("--all");

  const failed: string[] = [];
  const files = (await Promise.all(ROOTS.map(sourceFiles))).flat();
  const english = new Map<string, string>();
  for (const file of files) {
    for (const text of stringsIn(await readFile(file, "utf8"))) english.set(key(text), text);
  }
  console.log(`${english.size} translatable string(s) across ${files.length} file(s)\n`);
  if (!english.size) return;

  await mkdir(LOCALES_DIR, { recursive: true });
  const targets = LOCALES.filter(
    (l) => l.code !== DEFAULT_LOCALE && (only ? l.code === only : true),
  );

  for (const locale of targets) {
    const path = join(LOCALES_DIR, `${locale.code}.json`);
    let existing: Record<string, string> = {};
    try {
      existing = JSON.parse(await readFile(path, "utf8"));
    } catch {
      // First run for this language.
    }

    // Anything in the file that no longer matches a live English string is a
    // translation of a sentence that has been rewritten. Dropping it is the
    // point: keeping it would leave the page saying, in Russian, something the
    // English stopped saying.
    const stale = Object.keys(existing).filter((k) => !english.has(k));
    const missing = [...english].filter(([k]) => !existing[k]);

    console.log(
      `${locale.native.padEnd(10)} ${locale.code.padEnd(8)} ` +
        `${Object.keys(existing).length - stale.length} current, ${missing.length} missing` +
        (stale.length ? `, ${stale.length} stale` : ""),
    );

    if (!only && !all) continue;
    if (!missing.length && !stale.length) continue;

    // One language failing must not end the run: the other ten are
    // independent, and a half-finished sweep that reports what it managed is
    // more useful than a stack trace and no files.
    let fresh: Record<string, string> = {};
    if (missing.length) {
      try {
        fresh = await translateBatch(
          locale.code,
          locale.native,
          missing.map(([k, text]) => ({ key: k, text })),
        );
      } catch (e) {
        console.log(`    ✗ ${(e as Error).message.slice(0, 120)}`);
        failed.push(locale.code);
        continue;
      }
    }

    const next: Record<string, string> = {};
    for (const k of english.keys()) {
      const value = fresh[k] ?? existing[k];
      if (value) next[k] = value;
    }

    await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    console.log(`    → ${path} (${Object.keys(next).length} strings)`);
  }

  if (!only && !all) console.log(`\nreport only — pass --lang <code> or --all to translate.`);
  if (failed.length) {
    console.log(`\n✗ ${failed.join(", ")} failed — re-run, it picks up where it stopped.`);
    process.exitCode = 1;
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
