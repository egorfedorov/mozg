/**
 * A documentation page as Markdown, in the language being spoken.
 *
 * The same blocks that make the page make this: one source, two shapes. A
 * reader copies it into their notes; an agent reads it instead of scraping.
 */
import type { Block, Doc } from "@/content/docs";
import { t } from "@/lib/i18n";

const table = (head: string[], rows: string[][]): string => {
  const cols = Math.max(head.length, ...rows.map((r) => r.length));
  const line = (cells: string[]) => `| ${[...cells, ...Array(Math.max(0, cols - cells.length)).fill("")].map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`;
  const out: string[] = [];
  if (head.length) out.push(line(head), `| ${Array(cols).fill("---").join(" | ")} |`);
  for (const r of rows) out.push(line(r));
  return out.join("\n");
};

export function blocksMarkdown(blocks: Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.kind) {
      case "h":
        out.push(`## ${t(b.text)}`, "");
        break;
      case "p":
        out.push(t(b.text), "");
        break;
      case "list":
        out.push(...b.items.map((item) => `- ${t(item)}`), "");
        break;
      case "steps":
        out.push(...b.items.map((item, i) => `${i + 1}. ${t(item)}`), "");
        break;
      case "code":
        out.push("```", b.said ? t(b.code) : b.code, "```", "");
        break;
      case "note":
        out.push(`> ${t(b.text)}`, "");
        break;
      case "table":
        out.push(table(b.head.map(t), b.rows.map((r) => r.map(t))), "");
        break;
      case "term":
        out.push(`**${b.term}**`, `: ${t(b.text)}`, "");
        break;
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function docMarkdown(doc: Doc): string {
  return `# ${t(doc.title)}\n\n${t(doc.lede)}\n\n${blocksMarkdown(doc.blocks)}\n`;
}
