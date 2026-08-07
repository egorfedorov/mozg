/**
 * Wrap the prose of a page in t(), so scripts/translate.ts can see it.
 *
 *   npm run i18n:wrap -- src/app/page.tsx            # show the diff, write nothing
 *   npm run i18n:wrap -- src/app/page.tsx --write
 *   npm run i18n:wrap -- --public --write            # every page with a TopBar
 *
 * A codemod on the TypeScript AST rather than a regex, because the thing being
 * edited is JSX and a regex that thinks it understands JSX will eventually eat
 * a `>` inside an attribute.
 *
 * It is deliberately conservative, and the rule is one line: only text that is
 * the ONLY child of its element gets wrapped. A paragraph containing a <strong>
 * or a <Link> is left alone, because wrapping its fragments would hand the
 * translator three pieces of a sentence and get three pieces back that do not
 * agree with each other — the same failure the split headline had. Those are
 * reported at the end and are a hand job.
 *
 * What it will not touch: client components (no await there), files with no
 * default-exported component, and anything already wrapped.
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";

interface Edit {
  start: number;
  end: number;
  text: string;
}

/**
 * Tags that live INSIDE a sentence. Their text is a fragment of a bigger one —
 * `<em>for</em>` in the middle of a line is not a string a translator can do
 * anything useful with, and in most languages the emphasis lands on a
 * different word anyway. The whole sentence is a hand job; see the report.
 */
const INLINE = new Set([
  "a", "b", "code", "em", "i", "kbd", "s", "small", "span", "strong", "sub", "sup", "u",
  "Link",
]);

/** JSX text worth translating: has a letter, is not a lone entity or digit. */
function isProse(raw: string): boolean {
  const text = raw.trim();
  if (text.length < 2) return false;
  if (!/\p{L}/u.test(text)) return false;
  // A bare "·" separator or "—" with a stray word is layout, not a sentence.
  return /\p{L}{2,}/u.test(text);
}

/**
 * The literal to put inside t(): collapsed, entities decoded, escaped.
 *
 * Decoding matters. In JSX `&apos;` is markup that renders as an apostrophe;
 * inside a string it is five literal characters, and the translator would
 * faithfully carry "people&apos;s heads" into eleven languages. An expression
 * renders its string raw, so the character is what belongs here.
 */
const ENTITIES: Record<string, string> = {
  "&apos;": "'",
  "&rsquo;": "\u2019",
  "&lsquo;": "\u2018",
  "&ldquo;": "\u201c",
  "&rdquo;": "\u201d",
  "&quot;": '"',
  "&mdash;": "\u2014",
  "&ndash;": "\u2013",
  "&hellip;": "\u2026",
  "&nbsp;": "\u00a0",
  "&amp;": "&",
};

function literal(raw: string): string {
  let text = raw.trim().replace(/\s+/g, " ");
  for (const [entity, char] of Object.entries(ENTITIES)) {
    text = text.split(entity).join(char);
  }
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function transform(source: string, file: string): { output: string; wrapped: number; skipped: string[] } {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits: Edit[] = [];
  const skipped: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isJsxElement(node)) {
      const tag = node.openingElement.tagName.getText(sf);
      if (INLINE.has(tag)) {
        ts.forEachChild(node, visit);
        return;
      }
      const children = node.children.filter(
        (c) => !(ts.isJsxText(c) && !c.text.trim()),
      );
      const prose = children.filter((c) => ts.isJsxText(c) && isProse(c.text));

      if (prose.length && children.length === 1 && ts.isJsxText(children[0])) {
        // The whole element is one run of text: safe to wrap as one sentence.
        const child = children[0];
        edits.push({
          start: child.getStart(sf),
          end: child.getEnd(),
          text: `{t("${literal(child.text)}")}`,
        });
      } else if (prose.length) {
        // Mixed content — a sentence with a link or a <strong> inside it.
        const sample = prose
          .map((c) => (c as ts.JsxText).text.trim().replace(/\s+/g, " "))
          .join(" … ")
          .slice(0, 70);
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        skipped.push(`${file}:${line + 1}  ${sample}`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  if (!edits.length) return { output: source, wrapped: 0, skipped };

  let output = source;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }

  // The import, and the one call that binds t for the component. Both are
  // added only if missing, so re-running is a no-op rather than a mess.
  if (!/from "@\/lib\/t"/.test(output)) {
    output = output.replace(/^(import .*?;\n)/s, `$1import { translator } from "@/lib/t";\n`);
  }
  if (!/\bconst t = await translator\(\)/.test(output)) {
    // Make the default export async first — a server component may await, and
    // most of these already do; the ones that do not have to start.
    output = output.replace(
      /export default (async )?function (\w+)\(([^)]*)\)\s*\{/,
      (_m, _isAsync, name, params) =>
        `export default async function ${name}(${params}) {\n  const t = await translator();\n`,
    );

  }

  return { output, wrapped: edits.length, skipped };
}

async function pagesWithTopBar(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await pagesWithTopBar(path)));
    else if (entry.name === "page.tsx") {
      const src = await readFile(path, "utf8");
      if (src.includes("TopBar") && !src.includes('"use client"')) out.push(path);
    }
  }
  return out;
}

async function main() {
  const write = process.argv.includes("--write");
  const files = process.argv.includes("--public")
    ? await pagesWithTopBar("src/app")
    : process.argv.slice(2).filter((a) => a.endsWith(".tsx"));

  if (!files.length) {
    console.error("pass file paths, or --public for every page with a TopBar");
    process.exit(1);
  }

  let total = 0;
  const allSkipped: string[] = [];

  for (const file of files.sort()) {
    const source = await readFile(file, "utf8");
    const { output, wrapped, skipped } = transform(source, file);
    allSkipped.push(...skipped);
    if (!wrapped) continue;
    total += wrapped;
    console.log(`${wrapped.toString().padStart(3)} ${file}`);
    if (write && output !== source) await writeFile(file, output, "utf8");
  }

  console.log(`\n${total} string(s) wrapped across ${files.length} file(s)`);
  if (allSkipped.length) {
    console.log(
      `\n${allSkipped.length} paragraph(s) left alone — they have markup inside the sentence,\n` +
        `and splitting one into fragments gets fragments back that do not agree:\n`,
    );
    for (const s of allSkipped.slice(0, 40)) console.log(`  ${s}`);
    if (allSkipped.length > 40) console.log(`  … and ${allSkipped.length - 40} more`);
  }
  if (!write) console.log("\ndry run — nothing written. Re-run with --write.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
