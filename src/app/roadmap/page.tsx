import { readFile } from "node:fs/promises";
import { markup } from "@/lib/markup";
import { translator } from "@/lib/t";
import path from "node:path";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";

export const metadata = {
  title: "Roadmap — mozg",
  description:
    "What is shipped and what the rest of the year goes on, month by month, each with the gate that has to hold before the next one starts. The same file the repository keeps.",
};

/**
 * The roadmap, on the site, from the file the repository already keeps.
 *
 * Published for the same reason the exam scores are: a plan somebody can check is
 * worth more than a promise they cannot. Rendered from docs/ROADMAP.md rather than
 * retyped here — two copies of a plan diverge, and the one on the website would be
 * the stale one.
 */

/**
 * A deliberately small Markdown subset: the headings, emphasis, links, code spans
 * and lists this document actually uses. A dependency for the rest of Markdown
 * would be a dependency for features nobody is writing — and if the roadmap ever
 * needs a table, a table is what this should grow, not a parser.
 */
function inline(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .replace(/`([^`]+)`/g, '<code class="mono">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em style="opacity:.85">$2</em>')
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a class="linkish" href="$2" target="_blank" rel="noreferrer">$1</a>',
    );
}

function render(md: string): string {
  const out: string[] = [];
  let list: string[] | null = null;
  let para: string[] | null = null;

  const flush = () => {
    if (list?.length) {
      out.push(`<ul class="rm-list">${list.map((li) => `<li>${li}</li>`).join("")}</ul>`);
    }
    // The source is wrapped at eighty columns, so a paragraph arrives as several
    // lines. Emitting one <p> per line rendered the page as a column of
    // single-line paragraphs — airy, and wrong about where the sentences end.
    if (para?.length) {
      out.push(`<p class="rm-p">${para.join(" ")}</p>`);
    }
    list = null;
    para = null;
  };

  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      flush();
      continue;
    }
    // Bullets, including the two-space continuation this document uses.
    const bullet = line.match(/^\s*-\s+(.*)$/);
    if (bullet) {
      (list ??= []).push(inline(bullet[1]));
      continue;
    }
    if (list && /^\s{2,}\S/.test(raw)) {
      list[list.length - 1] += " " + inline(line.trim());
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flush();
      // The file's own title is dropped: this page has a headline of its own, and
      // two of them one under the other reads as a mistake.
      if (h[1].length === 1) continue;
      const cls = h[1].length === 2 ? "rm-h2" : "rm-h3";
      out.push(`<h${h[1].length} class="${cls}">${inline(h[2])}</h${h[1].length}>`);
      continue;
    }

    if (list) flush();
    (para ??= []).push(inline(line.trim()));
  }
  flush();
  return out.join("\n");
}

export default async function RoadmapPage() {
  const t = await translator();

  // Read at request time from the deployed image: the file ships with the app, so
  // this is always the plan the running version was built from.
  const file = path.join(process.cwd(), "docs", "ROADMAP.md");
  const md = await readFile(file, "utf8").catch(() => null);

  return (
    <>
      <TopBar />
      <Contents active="/roadmap" />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">{t("Roadmap")}</p>
        <h1
          className="display"
          style={{ fontSize: "clamp(2rem, 5.5vw, 3.4rem)", margin: ".4rem 0 1rem" }}
        >
          {markup(t("Dated, gated, <0/> and checkable."), [
          <br key="s0" />,
        ])}</h1>
        <p className="lede">
          {markup(t("Every month carries three items and a gate that has to hold before the next month starts. This is the same file the repository keeps — if the two ever disagree, this page is the one that is wrong, and you can <0>read it there</0> ."), [
          <Link className="linkish"
            href="https://github.com/egorfedorov/mozg/blob/main/docs/ROADMAP.md"
            target="_blank"
            rel="noreferrer" key="s0" />,
        ])}</p>

        {md ? (
          <div
            className="roadmap"
            style={{ marginTop: "clamp(2rem, 5vw, 3rem)", maxWidth: "68ch" }}
            dangerouslySetInnerHTML={{ __html: render(md) }}
          />
        ) : (
          <p className="lede" style={{ marginTop: "2rem" }}>
            {markup(t("The plan lives in the repository and this page could not read it — <0>docs/ROADMAP.md</0> is the original."), [
            <Link className="linkish"
              href="https://github.com/egorfedorov/mozg/blob/main/docs/ROADMAP.md"
              target="_blank"
              rel="noreferrer" key="s0" />,
          ])}</p>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
