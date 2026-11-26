/**
 * What a public site hands to machines, made before every build:
 *
 *   public/sitemap.xml     every page, in every finished language, with each
 *                          page's other languages named beside it (hreflang)
 *   public/robots.txt      the map's address, and nothing else
 *   public/llms.txt        the documentation in Markdown, page by page, for an
 *                          agent that would rather read than scrape
 *   public/changelog.xml   the changelog as an Atom feed
 *
 * All of it comes from the same data the pages come from, so none of it can
 * drift from them. A language appears here exactly when it appears in the
 * routes: the day its last sentence is done.
 */

import { rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { SITE_LANGS, DOCS_LANGS, sitePath }: typeof import("../src/site/paths.ts") = await import("../src/site/paths.ts");
const { DOCS }: typeof import("../src/content/docs.ts") = await import("../src/content/docs.ts");
const { CHANGELOG }: typeof import("../src/content/changelog.ts") = await import("../src/content/changelog.ts");
const { LANG_TAG }: typeof import("../src/lib/i18n.ts") = await import("../src/lib/i18n.ts");
const { INSTALL }: typeof import("../src/lib/install.ts") = await import("../src/lib/install.ts");

const site = INSTALL.site.replace(/\/$/, "");
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A page and the languages it exists in. */
interface Page {
  path: string;
  langs: string[];
  /** When it last changed, as ISO. Left out for pages that change with the build. */
  updated?: string;
}

const changelogDates = CHANGELOG.filter((entry) => entry.date).map((entry) => entry.date!);
const lastRelease = changelogDates[0];

const pages: Page[] = [
  { path: "/", langs: SITE_LANGS },
  { path: "/changelog/", langs: SITE_LANGS, updated: lastRelease },
  { path: "/docs/", langs: DOCS_LANGS },
  ...DOCS.filter((doc) => doc.slug).map((doc) => ({ path: `/docs/${doc.slug}/`, langs: DOCS_LANGS })),
];

async function replaceWhole(file: string, text: string): Promise<void> {
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, text);
  await rename(tmp, file);
}

function sitemap(): string {
  const url = (page: Page) => [
    "  <url>",
    `    <loc>${escape(site + sitePath("en", page.path))}</loc>`,
    ...(page.updated ? [`    <lastmod>${page.updated}</lastmod>`] : []),
    // Every language the page exists in, and English for the rest of the world.
    ...page.langs.map((lang) => `    <xhtml:link rel="alternate" hreflang="${LANG_TAG[lang as keyof typeof LANG_TAG]}" href="${escape(site + sitePath(lang as never, page.path))}"/>`),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${escape(site + sitePath("en", page.path))}"/>`,
    "  </url>",
  ].join("\n");
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">', ...pages.map(url), "</urlset>", ""].join("\n");
}

function llms(): string {
  const page = (doc: (typeof DOCS)[number]) => [`## ${doc.title}`, "", `- ${doc.lede}`, `- URL: ${site}${sitePath("en", doc.slug ? `/docs/${doc.slug}/` : "/docs/")}`, ""].join("\n");
  return [
    "# mozg",
    "",
    "> Own what your AI writes. mozg is a local plugin for Claude Code: it reads what the agent changed, asks the person one question about the change with the most at stake, and an examiner that did not write the code grades the answer. A pass makes that module the person's, and the agent runs free there. Where a module is not theirs, the agent asks before its first edit. Local only: no keys, no accounts.",
    "",
    "The documentation is on these pages. Each has a \"Copy as Markdown\" button, and its text is on the page itself.",
    "",
    ...DOCS.map(page),
    "## Optional",
    "",
    `- The changelog: ${site}/changelog/`,
    `- The pricing and the questions: ${site}/#pricing and ${site}/#questions`,
    "",
  ].join("\n");
}

/** The changelog as Atom: the entries that shipped, newest first. */
function feed(): string {
  const entry = (item: (typeof CHANGELOG)[number]) => [
    "  <entry>",
    `    <id>${site}/changelog/#${escape(item.version ?? item.date ?? "")}</id>`,
    `    <title>${escape(item.title)}</title>`,
    `    <updated>${item.date}T12:00:00Z</updated>`,
    `    <summary>${escape(item.summary)}</summary>`,
    "  </entry>",
  ].join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <title>mozg — changelog</title>`,
    `  <id>${site}/changelog/</id>`,
    `  <updated>${changelogDates[0] ?? "2026-01-01"}T12:00:00Z</updated>`,
    `  <link href="${site}/changelog/"/>`,
    `  <link href="${site}/changelog.xml" rel="self"/>`,
    ...CHANGELOG.filter((item) => item.date).map(entry),
    "</feed>",
    "",
  ].join("\n");
}

const publicDir = join(root, "public");
await replaceWhole(join(publicDir, "sitemap.xml"), sitemap());
await replaceWhole(join(publicDir, "robots.txt"), `User-agent: *\nAllow: /\n\n# The operator's panel is reached by a link, never by a search.\nDisallow: /admin/\n\nSitemap: ${site}/sitemap.xml\n`);
await replaceWhole(join(publicDir, "llms.txt"), llms());
await replaceWhole(join(publicDir, "changelog.xml"), feed());
process.stdout.write(
  `sitemap with ${pages.length} pages in ${SITE_LANGS.length} language${SITE_LANGS.length === 1 ? "" : "s"}, llms.txt, changelog.xml\n`,
);
