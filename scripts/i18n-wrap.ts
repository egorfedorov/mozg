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
 * Text that is the only child of its element becomes t("…").
 *
 * A sentence with a <Link> or a <strong> in the middle of it becomes one
 * string too — never fragments. The markup is carried in the sentence as
 * numbered slots and put back by markup() at render time:
 *
 *   <p>Open the <Link href="/explore">catalogue</Link> and pick a tool.</p>
 *   → {markup(t("Open the <0>catalogue</0> and pick a tool."), [<Link href="/explore" />])}
 *
 * Splitting those into three t() calls was the alternative, and it is the same
 * failure the split headline had: three pieces come back that do not agree
 * about case or order, and in half these languages the link belongs at the
 * other end of the clause.
 *
 * What it will not touch: client components (no await there), files with no
 * default-exported component, anything already wrapped, and a sentence whose
 * markup is nested more than one deep — those are still reported for hand
 * work, because a slot inside a slot needs a person to decide what the
 * sentence actually is.
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

function decode(raw: string): string {
  let text = raw;
  for (const [entity, char] of Object.entries(ENTITIES)) {
    text = text.split(entity).join(char);
  }
  return text;
}

function escape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function literal(raw: string): string {
  return escape(decode(raw.trim().replace(/\s+/g, " ")));
}

/**
 * One sentence built out of a paragraph's mixed children, plus the slots.
 *
 * Interior whitespace is collapsed but NOT trimmed — the single space either
 * side of a link is part of the sentence, and trimming each piece is how
 * "Open the<0>catalogue</0>and pick" happens.
 */
interface Woven {
  sentence: string;
  slots: string[];
}

/**
 * A slot element carries its own key.
 *
 * markup() sets one anyway when it clones, so this is not React's requirement
 * being met twice — it is eslint's react/jsx-key, which sees literal JSX
 * inside an array and cannot know what happens to it afterwards. A hundred and
 * fifty suppressions would have been the other way to answer that, and the
 * rule is right often enough not to teach it to stay quiet.
 */
function keyed(element: string, index: number): string {
  // Straight after the tag name, which is the one position that works for a
  // self-closing tag and a tag with children alike. Attribute order is free.
  return element.replace(/^<([A-Za-z][\w.]*)/, `<$1 key="s${index}"`);
}

/** An arrow or function whose own parameter is called `t`. */
function shadowsT(node: ts.Node): boolean {
  if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) return false;
  return node.parameters.some((p) => ts.isIdentifier(p.name) && p.name.text === "t");
}

/** Does this expression carry a sentence of its own inside some JSX? */
function hidesProse(node: ts.Node): boolean {
  let found = false;
  const walk = (n: ts.Node) => {
    if (found) return;
    if (ts.isJsxText(n) && isProse(n.text)) {
      found = true;
      return;
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return found;
}

function weave(node: ts.JsxElement, sf: ts.SourceFile): Woven | null {
  let sentence = "";
  const slots: string[] = [];

  const add = (text: string) => {
    // Never two spaces where a {" "} sits next to text that already ends in
    // one — the key is a hash of this string, and a stray space is a different
    // sentence that no translation will ever match.
    sentence += sentence.endsWith(" ") ? text.replace(/^ +/, "") : text;
  };

  for (const child of node.children) {
    if (ts.isJsxText(child)) {
      if (!child.text.trim()) {
        // Whitespace between two elements is still a word boundary.
        if (/\s/.test(child.text)) add(" ");
        continue;
      }
      add(decode(child.text.replace(/\s+/g, " ")));
      continue;
    }

    if (ts.isJsxSelfClosingElement(child)) {
      slots.push(keyed(child.getText(sf), slots.length));
      add(`<${slots.length - 1}/>`);
      continue;
    }

    if (ts.isJsxElement(child)) {
      const tag = child.openingElement.tagName.getText(sf);
      if (!INLINE.has(tag)) return null;
      const inner = child.children;
      if (inner.length !== 1 || !ts.isJsxText(inner[0])) {
        // Not one run of text inside. If there are no words in there either —
        // `<a href={…}>{contact}</a>`, a link whose label is a value — the
        // whole element drops in as an opaque slot and the sentence around it
        // still gets translated. If there ARE words (a link wrapped round an
        // <em>), a person decides: burying them in a slot would take a
        // translatable phrase off the page.
        if (hidesProse(child)) return null;
        slots.push(keyed(child.getText(sf).replace(/\s+/g, " "), slots.length));
        add(`<${slots.length - 1}/>`);
        continue;
      }
      const attrs = child.openingElement.attributes.getText(sf).trim();
      slots.push(`<${tag}${attrs ? ` ${attrs}` : ""} key="s${slots.length}" />`);
      add(`<${slots.length - 1}>${decode(inner[0].text.replace(/\s+/g, " ")).trim()}</${slots.length - 1}>`);
      continue;
    }

    if (ts.isJsxExpression(child)) {
      const expr = child.expression;
      if (!expr) continue;
      // {" "} is a space the layout needed, not a value.
      if (ts.isStringLiteral(expr) && !expr.text.trim()) {
        add(" ");
        continue;
      }
      // An expression that contains prose of its own — a conditional fragment
      // with a whole sentence in it — must not become a slot: the sentence
      // would vanish inside an argument and stop being translatable at all,
      // which is worse than the paragraph nobody had wrapped yet. Hand work.
      if (hidesProse(expr)) return null;
      slots.push(expr.getText(sf));
      add(`<${slots.length - 1}/>`);
      continue;
    }

    return null;
  }

  sentence = sentence.replace(/\s+/g, " ").trim();
  // A sentence that is only slots has no words to translate; leaving it as JSX
  // is both cheaper and more honest than a t() call over "<0/> · <1/>".
  if (!isProse(sentence.replace(/<\/?\d+\/?>/g, " "))) return null;
  return { sentence: escape(sentence), slots };
}

function transform(source: string, file: string): { output: string; wrapped: number; skipped: string[] } {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits: Edit[] = [];
  const skipped: string[] = [];

  /**
   * Only the default-exported component is rewritten.
   *
   * `t` is bound by one `await translator()` at the top of that function, and
   * a page's little helper components below it (a Step, a Row) are plain
   * synchronous functions that cannot see it — wrapping their text compiles to
   * "Cannot find name 't'". Handing every helper its own translator is a
   * bigger change than these labels are worth; they stay English until someone
   * decides otherwise.
   */
  const root = sf.statements.find(
    (s): s is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(s) &&
      Boolean(s.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)),
  );
  if (!root?.body) return { output: source, wrapped: 0, skipped };

  /**
   * @param inSentence This node sits inside a paragraph that has words of its
   * own, so an inline tag here is a fragment — `<em>for</em>` mid-line — and
   * its text must not be wrapped alone. Outside one, the same `<span>` or
   * `<Link>` is a standalone label ("Sign in", "between its last two exam
   * sittings") and has to be. Treating every inline tag as a fragment is what
   * left the header and half the small print in English.
   */
  function visit(node: ts.Node, inSentence = false) {
    // A callback that named its parameter `t` shadows the translator, and the
    // rewrite compiles to "AgentTaught has no call signatures" three hundred
    // lines away from the cause. Leave that subtree alone and say so.
    if (shadowsT(node)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      skipped.push(`${file}:${line + 1}  (a callback parameter named "t" shadows the translator)`);
      return;
    }
    if (ts.isJsxElement(node)) {
      const tag = node.openingElement.tagName.getText(sf);
      // Code is never prose. A standalone <code>npm run worker</code> would
      // otherwise go to a translator, and come back translated.
      if ((INLINE.has(tag) && inSentence) || tag === "code" || tag === "kbd") {
        ts.forEachChild(node, (c) => visit(c, inSentence));
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
        const woven = weave(node, sf);
        if (woven) {
          // Indent the slot list under the element it came from, or a page of
          // these reads like the codemod resented being asked.
          const { character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          const pad = " ".repeat(character);
          const slots = woven.slots.map((s) => `\n${pad}  ${s},`).join("");
          edits.push({
            start: node.children[0].getStart(sf),
            end: node.children[node.children.length - 1].getEnd(),
            // No slots means the "mixed" content was text and whitespace all
            // along — a plain t() says that, and markup(…, []) only makes the
            // next reader look for the markup that is not there.
            text: woven.slots.length
              ? `{markup(t("${woven.sentence}"), [${slots}\n${pad}])}`
              : `{t("${woven.sentence}")}`,
          });
          // Its children are now inside a string; walking into them would
          // wrap the same words a second time.
          return;
        }
        const sample = prose
          .map((c) => (c as ts.JsxText).text.trim().replace(/\s+/g, " "))
          .join(" … ")
          .slice(0, 70);
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        skipped.push(`${file}:${line + 1}  ${sample}`);
        // Refused, so its pieces stay pieces: walking in with inSentence set
        // stops the inline tags of a sentence nobody could weave from being
        // wrapped one fragment at a time.
        ts.forEachChild(node, (c) => visit(c, true));
        return;
      }
      ts.forEachChild(node, (c) => visit(c, prose.length > 0));
      return;
    }
    ts.forEachChild(node, (c) => visit(c, inSentence));
  }
  visit(root.body);

  if (!edits.length) return { output: source, wrapped: 0, skipped };

  let output = source;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }

  // Bind t for the component, and make it async if it was not.
  //
  // By position, from the AST, and BEFORE the imports go in at the top of the
  // file — every offset here was measured against the original source, and an
  // import line added first shifts them all by its own length. That is how a
  // `const t = await translator();` ended up spliced through the middle of a
  // props type. The regex this replaced could not see past a parameter list
  // containing a `)` at all, which is most components.
  if (!/\bconst t = await translator\(\)/.test(output)) {
    const bodyOpen = root.body.getStart(sf) + 1;
    output = output.slice(0, bodyOpen) + "\n  const t = await translator();\n" + output.slice(bodyOpen);

    // A server component that now awaits has to say so. One rendered from a
    // client component cannot become async — those files are out of scope
    // here, and the build failing is the honest way to find one.
    if (!root.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
      const kw = output.indexOf("function", root.getStart(sf));
      output = output.slice(0, kw) + "async " + output.slice(kw);
    }
  }

  // Added only if missing, so re-running is a no-op rather than a mess.
  //
  // In front of the first import, found on the AST rather than by anchoring a
  // regex at position 0 — half these files open with a block comment
  // explaining themselves, and the anchored version simply never matched
  // there, leaving a component calling a translator it had not imported.
  const firstImport = sf.statements.find(ts.isImportDeclaration);
  const at = firstImport ? firstImport.getStart(sf) : 0;
  const lines =
    (/from "@\/lib\/t"/.test(output) ? "" : `import { translator } from "@/lib/t";\n`) +
    (/\bmarkup\(/.test(output) && !/from "@\/lib\/markup"/.test(output)
      ? `import { markup } from "@/lib/markup";\n`
      : "");
  if (lines) output = output.slice(0, at) + lines + output.slice(at);

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
