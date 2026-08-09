/**
 * Fail the build when a sentence reaches a reader untranslated.
 *
 *   npm run check:i18n
 *
 * Everything the site says was wrapped in t() once, by hand and by codemod, and
 * nothing stopped the next commit from adding a bare <p>Hello</p>. That is not
 * hypothetical: the landing page's five cards, six headings on /start, every
 * alt text on /about and three hundred and twenty button labels each survived a
 * sweep that had already been run over the same files, because nobody had
 * written down where to look.
 *
 * So this looks in the three places that have caught things, using the SAME
 * predicates as scripts/i18n-wrap.ts — if the two disagreed, this would report
 * strings the codemod then refuses to fix:
 *
 *   1. JSX text that is a sentence            <p>Hello</p>
 *   2. a sentence in an attribute people read title="Hello"
 *   3. a sentence in an expression            {busy ? "Saving…" : "Save"}
 *
 * What it cannot see, and a person still has to: prose inside a template
 * literal, `${n} calls this month`. The sentence is assembled at runtime, so
 * there is no literal to find, and every attempt to guess one produced more
 * URLs and CSS values than sentences. That gap is why fill() exists.
 *
 * Deliberate exceptions live in ALLOW, each with the reason. A bare personal
 * name and a fact sheet written for an agent are not oversights.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";
import { ALLOW, HUMAN_ATTRS, isProse, isProseAttr } from "./i18n-wrap";

const ROOTS = ["src/app", "src/components", "src/lib"];

interface Hit {
  file: string;
  line: number;
  text: string;
}

async function files(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await files(path)));
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes(".test.")) out.push(path);
  }
  return out;
}

/** Is this node already inside a call that translates? */
function translated(node: ts.Node): boolean {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && ts.isIdentifier(p.expression)) {
      const name = p.expression.text;
      if (name === "t" || name === "msg" || name === "fill") return true;
    }
  }
  return false;
}

/**
 * Is a literal in this position shown to somebody?
 *
 * The same three positions the codemod writes to, and the same refusals: an
 * argument to a method call is machinery (`toLocaleString("en-US")`), and an
 * attribute nobody reads is not copy (href, className, id).
 */
function isDisplayed(node: ts.Node, sf: ts.SourceFile): boolean {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p)) {
      if (ts.isPropertyAccessExpression(p.expression) && p.arguments.some((a) => a === node)) {
        return false;
      }
    }
    if (ts.isJsxAttribute(p)) return HUMAN_ATTRS.has(p.name.getText(sf));
    if (ts.isJsxExpression(p)) {
      return Boolean(p.parent && (ts.isJsxElement(p.parent) || ts.isJsxFragment(p.parent)));
    }
  }
  return false;
}

async function main() {
  const hits: Hit[] = [];

  for (const root of ROOTS) {
    for (const file of await files(root)) {
      const source = await readFile(file, "utf8");
      const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const at = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
      // `value` is what the reader would see; `label` is how the report names
      // it. ALLOW matches the value, so an entry keeps working when the same
      // string moves from a child to an attribute.
      const record = (n: ts.Node, value: string, label = value) => {
        const trimmed = value.trim().replace(/\s+/g, " ");
        if (ALLOW.has(trimmed)) return;
        hits.push({ file, line: at(n), text: label.trim().replace(/\s+/g, " ").slice(0, 88) });
      };

      const walk = (node: ts.Node) => {
        // Code is never prose, in any language.
        if (ts.isJsxElement(node)) {
          const tag = node.openingElement.tagName.getText(sf);
          if (tag === "code" || tag === "kbd") return;
        }

        if (ts.isJsxText(node) && isProse(node.text) && !translated(node)) {
          record(node, node.text);
        }

        if (
          ts.isJsxAttribute(node) &&
          node.initializer &&
          ts.isStringLiteral(node.initializer) &&
          HUMAN_ATTRS.has(node.name.getText(sf)) &&
          isProseAttr(node.initializer.text)
        ) {
          record(node, node.initializer.text, `${node.name.getText(sf)}="${node.initializer.text}"`);
        }

        if (
          ts.isStringLiteral(node) &&
          isProseAttr(node.text) &&
          !translated(node) &&
          isDisplayed(node, sf) &&
          // The attribute form is reported above; do not name it twice.
          !(node.parent && ts.isJsxAttribute(node.parent))
        ) {
          record(node, node.text, `"${node.text}"`);
        }

        ts.forEachChild(node, walk);
      };
      walk(sf);
    }
  }

  if (!hits.length) {
    console.log("i18n  ok — every sentence the scanners can see is wrapped");
    return;
  }

  console.error(`\n${hits.length} untranslated string(s):\n`);
  for (const h of hits) console.error(`  ${h.file}:${h.line}  ${h.text}`);
  console.error(
    "\nWrap them: npm run i18n:wrap -- <file> --write, then npm run translate -- --all." +
      "\nA sentence built from a template literal needs fill() and a person." +
      "\nDeliberately English? Add it to ALLOW in scripts/i18n-wrap.ts with the reason —\n" +
      "the codemod reads the same list, so it will stop re-wrapping it too.\n",
  );
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
