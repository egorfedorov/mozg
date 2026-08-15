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

/**
 * Text that is meant to stay English, and why.
 *
 * Shared with scripts/check-i18n.ts on purpose: without it the two disagree
 * forever — the check stays quiet about a bare personal name while this file
 * re-wraps it on every run, so the same line reappears in every diff and the
 * reason it should not be translated lives only in somebody's memory.
 *
 * Keep it short. An allow list that grows is a check somebody has stopped
 * believing.
 */
export const ALLOW = new Map<string, string>([
  ["Egor Fedorov", "a bare personal name has nothing in it to translate, and asking got two different Arabic spellings of the same man"],
  ["one brain, every agent", "baked into the OG image, which crawlers fetch with no language"],
  ["mozg", "the product's name"],
  ["chatmozg", "the product's name"],
  ["github.com/egorfedorov/mozg", "a URL"],
  ["Model Context Protocol", "the protocol's name, in every language"],
  ["Claude Code", "another company's product name"],
  ["Codex", "another company's product name"],
  ["Cursor", "another company's product name"],
  // The export listing on /gen is a terminal transcript: filenames a developer
  // types and a command they paste. Translating "symbols.png" would produce a
  // file that does not exist in the archive.
  ["unzip tomb-of-the-scarab-king.zip", "a shell command, shown as typed"],
  ["symbols.png", "a filename in the export"],
  ["symbols.json", "a filename in the export"],
  ["trimmed/wild.png · scatter.png · low-1.png …", "filenames in the export"],
  ["originals/", "a folder in the export"],
  ["PROMPTS.md", "a filename in the export"],
]);

/** Deliberately English, per ALLOW. */
export function allowed(text: string): boolean {
  return ALLOW.has(decode(text).trim().replace(/\s+/g, " "));
}

/**
 * Attributes whose value is a sentence somebody reads or hears.
 *
 * The text scanner cannot see these — `title="Make an account"` is an
 * attribute, not a child — and for a long time nothing did: six headings on
 * /start, the five cards on the landing page, and every alt text on /about
 * were English in eleven languages while the paragraphs around them were not.
 *
 * `alt` and `aria-label` are in here on purpose. A screen reader is somebody
 * reading the page, and leaving them out is the accessible version of not
 * translating it at all.
 *
 * Everything absent from this list — href, className, name, id, type, value —
 * is machinery, and a translated className is a broken page.
 */
export const HUMAN_ATTRS = new Set([
  "alt", "aria-label", "aside", "blurb", "caption", "description", "empty",
  "eyebrow", "heading", "hint", "label", "lede", "legend", "message", "meta",
  "note", "placeholder", "sub", "summary", "title", "tooltip", "why",
]);

/**
 * An attribute value worth translating.
 *
 * Stricter than isProse: a lone lowercase token in a `title` is a slug or a
 * key nine times out of ten, and `alt=""` on a decorative image must stay
 * exactly that.
 */
export function isProseAttr(text: string): boolean {
  if (text.trim().length < 3) return false;
  if (!/\p{L}{2,}/u.test(text)) return false;
  return !/^[a-z0-9_-]+$/.test(text.trim());
}

/** JSX text worth translating: has a letter, is not a lone entity or digit. */
export function isProse(raw: string): boolean {
  // Decoded first, or the entity's own NAME counts as the word: `(&quot;` is
  // two punctuation marks around a value, and "quot" is four letters to a
  // regex. Both the codemod and the check reported those as untranslated
  // sentences and neither could do anything with them.
  const text = decode(raw).trim();
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

/**
 * Does the component already own a binding called `t` that is not a translator?
 *
 * `const t = totals[0]` on /admin, `tokens.map((t) => …)` on /settings/tokens.
 * Splicing `const t = await translator()` in beside either of those compiles to
 * "Cannot redeclare block-scoped variable" or, worse, to `t.users` resolving
 * against the translator — a page that typechecked yesterday failing in five
 * places today, none of them where the codemod ran. Refuse the file and say so;
 * renaming somebody's variable is a decision a person makes.
 */
function bindsT(body: ts.Node, sf: ts.SourceFile): ts.Node | null {
  let found: ts.Node | null = null;
  const walk = (n: ts.Node) => {
    if (found) return;
    // Only the component's own scope. A `.map((t) => …)` further in shadows the
    // translator for its own subtree and nothing else — visit() already skips
    // those and reports them — so refusing the whole file over one would leave
    // every other sentence on the page English, which is what it did.
    if (
      n !== body &&
      (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n))
    ) {
      return;
    }
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === "t" &&
      // Either binding of the real thing is fine — that is a file already
      // wrapped, and re-running must stay a no-op.
      !/\b(translator|useT)\(\)/.test(n.getText(sf))
    ) {
      found = n;
      return;
    }
    // `const { t } = await searchParams` — a destructured binding, which is a
    // BindingElement and not an Identifier on the declaration. /settings/tokens
    // reads its tab from ?t=, and the first version of this check walked
    // straight past it.
    if (ts.isBindingElement(n) && ts.isIdentifier(n.name) && n.name.text === "t") {
      found = n;
      return;
    }
    if (shadowsT(n)) {
      found = n;
      return;
    }
    ts.forEachChild(n, walk);
  };
  walk(body);
  return found;
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
  const client = /^\s*["']use client["']/m.test(source);

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

  // Before any edit, not after: a half-wrapped file that does not compile is
  // worse than an untouched one, and the report is what a person acts on.
  const taken = bindsT(root.body, sf);
  if (taken) {
    const { line } = sf.getLineAndCharacterOfPosition(taken.getStart(sf));
    skipped.push(`${file}:${line + 1}  (something else here is already called "t" — rename it first)`);
    return { output: source, wrapped: 0, skipped };
  }

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
    // Attributes are wrapped wherever they are found, independently of the
    // element's children — a <Card title="…" blurb="…" /> is self-closing and
    // never reaches the text branches below at all.
    if (
      ts.isJsxAttribute(node) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      HUMAN_ATTRS.has(node.name.getText(sf)) &&
      isProseAttr(node.initializer.text) &&
      !allowed(node.initializer.text)
    ) {
      edits.push({
        start: node.initializer.getStart(sf),
        end: node.initializer.getEnd(),
        text: `{t("${literal(node.initializer.text)}")}`,
      });
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
        if (allowed(child.text)) return;
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

  /**
   * The literals that live in an expression rather than in the markup.
   *
   *   {pending ? "Adding…" : "Add pages"}
   *   empty={rows.length ? undefined : "Nothing here yet."}
   *
   * Both are words on the page, and neither is JSX text or a bare attribute
   * value, so everything above walks straight past them. Three hundred of them
   * survived the first sweep — every disabled-button label on the site, which
   * is the text somebody reads exactly when they are waiting and looking.
   *
   * Scoped hard on purpose: only inside a JSX child expression or one of the
   * attributes people actually read, never inside style/className/href, and
   * never inside a call that already translates.
   */
  const covered = (n: ts.Node) =>
    edits.some((e) => n.getStart(sf) >= e.start && n.getEnd() <= e.end);

  const inExpression = (node: ts.Node) => {
    if (!ts.isStringLiteral(node) || !isProseAttr(node.text) || covered(node)) return;
    if (allowed(node.text)) return;
    let display = false;
    for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
      if (ts.isCallExpression(p)) {
        if (ts.isIdentifier(p.expression)) {
          const name = p.expression.text;
          // Already translated, or already a slot-filled sentence.
          if (name === "t" || name === "msg" || name === "fill") return;
        }
        // An argument to a method call is machinery until proven otherwise:
        // toLocaleString("en-US"), join(", "), split("\n"), replace(…).
        // Wrapping the first of those shipped `toLocaleString(t("en-US"))`,
        // and the translator dutifully returned hi-IN — so Hindi silently got
        // lakh grouping on a number the code had asked to format one way. One
        // translation away from a RangeError, too. A real sentence in that
        // position is rare and belongs to a person; it shows up in the report.
        if (ts.isPropertyAccessExpression(p.expression) && p.arguments.some((a) => a === node)) {
          return;
        }
      }
      if (ts.isJsxAttribute(p)) {
        display = HUMAN_ATTRS.has(p.name.getText(sf));
        break;
      }
      if (ts.isJsxExpression(p)) {
        display = Boolean(p.parent && (ts.isJsxElement(p.parent) || ts.isJsxFragment(p.parent)));
        break;
      }
    }
    if (display) {
      edits.push({
        start: node.getStart(sf),
        end: node.getEnd(),
        text: `t("${escape(decode(node.text))}")`,
      });
    }
  };
  const sweep = (n: ts.Node) => {
    if (shadowsT(n)) return;
    inExpression(n);
    ts.forEachChild(n, sweep);
  };
  sweep(root.body);

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
  //
  // Which translator depends on which side of the boundary the file is on.
  // lib/t.ts reads the cookie through next/headers and hashes with node:crypto,
  // so a client component has to use the hook instead — same name, same
  // promise, different machinery. See lib/t-client.tsx.
  const bind = client ? "  const t = useT();\n" : "  const t = await translator();\n";
  if (!/\bconst t = (await translator|useT)\(\)/.test(output)) {
    const bodyOpen = root.body.getStart(sf) + 1;
    output = output.slice(0, bodyOpen) + "\n" + bind + output.slice(bodyOpen);

    // A server component that now awaits has to say so. A client component must
    // NOT become async — a hook in an async function is not a component, and
    // React says so at runtime rather than at build time.
    if (!client && !root.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
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
  const translatorImport = client
    ? [/from "@\/lib\/t-client"/, `import { useT } from "@/lib/t-client";\n`] as const
    : [/from "@\/lib\/t"/, `import { translator } from "@/lib/t";\n`] as const;
  const lines =
    (translatorImport[0].test(output) ? "" : translatorImport[1]) +
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
      // Client pages are no longer excluded — they get useT() instead of the
      // server translator, which is what the `client` branch in transform() is
      // for.
      if (src.includes("TopBar")) out.push(path);
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

// Only when run as a script — the predicates above are imported by
// scripts/check-i18n.ts, which must agree with this file about what counts as
// prose. Two definitions would drift, and the day they do the check reports a
// string the codemod refuses to wrap.
if (/i18n-wrap\.(ts|mjs)$/.test(process.argv[1] ?? "")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
