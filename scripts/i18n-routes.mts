/**
 * A folder of routes for every language that is translated in full.
 *
 * Next cannot be told "no pages of this kind yet": a route with a parameter
 * must name at least one value before `output: export` will build it. So the
 * routes are written out here, one folder per language, before every build.
 * With no language finished there are no folders, and the build is the English
 * site alone.
 *
 * The files are three lines each and are not kept: they are made again from
 * this file and from `npm run i18n:check`'s count. Change the pages under
 * src/site/pages, never these.
 */

import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const where = join(root, "src", "app", "(locale)");

const { SITE_LANGS, DOCS_LANGS } = await import("../src/site/paths.ts");
const header = "// Made by scripts/i18n-routes.mts before a build. Do not edit.\n";

/** The files of one language's folder. */
function files(lang: string): [string, string][] {
  return [
    ["layout.tsx", `${header}import LocaleRoot, { metadata } from "@/site/roots/LocaleRoot";

export { metadata };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <LocaleRoot lang="${lang}">{children}</LocaleRoot>;
}
`],
    ["page.tsx", `${header}import { landingMetadata, LandingPage } from "@/site/pages/LandingPage";

export const metadata = landingMetadata("${lang}");

export default function Page() {
  return <LandingPage lang="${lang}" />;
}
`],
    ["changelog/page.tsx", `${header}import { changelogMetadata, Changelog } from "@/site/pages/ChangelogPage";

export const metadata = changelogMetadata("${lang}");

export default function Page() {
  return <Changelog lang="${lang}" />;
}
`],
    ["docs/page.tsx", `${header}import { docMetadata, DocPage } from "@/site/pages/DocPage";

export const metadata = docMetadata("${lang}", "");

export default function Page() {
  return <DocPage lang="${lang}" slug="" />;
}
`],
    [
      "docs/[...slug]/page.tsx",
      `${header}import { docMetadata, DocPage, docParams } from "@/site/pages/DocPage";

export const dynamicParams = false;
export function generateStaticParams() {
  return docParams();
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return docMetadata("${lang}", slug.join("/"));
}

export default async function Page({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return <DocPage lang="${lang}" slug={slug.join("/")} />;
}
`,
    ],
  ];
}

await mkdir(where, { recursive: true });
// Start clean: a language that is no longer finished must not leave pages behind.
for (const name of await readdir(where)) await rm(join(where, name), { recursive: true, force: true });

const languages = SITE_LANGS.filter((lang) => lang !== "en");
for (const lang of languages) {
  const folder = join(where, lang);
  for (const [name, text] of files(lang)) {
    // The documentation only where it is translated in full.
    if (name.startsWith("docs/") && !DOCS_LANGS.includes(lang as never)) continue;
    await mkdir(dirname(join(folder, name)), { recursive: true });
    await writeFile(join(folder, name), text);
  }
}

process.stdout.write(`routes for ${languages.length ? languages.join(", ") : "English only"}${languages.some((l) => !DOCS_LANGS.includes(l as never)) ? " (documentation in English for some)" : ""}\n`);
