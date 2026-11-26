import type { Metadata } from "next";
import "@/i18n";
import DocsPage from "@/site/DocsPage";
import { DOCS, docAt } from "@/content/docs";
import { alternatesFor, DOCS_LANGS } from "@/site/paths";
import { setLanguage, t, type Lang } from "@/lib/i18n";

export function DocPage({ lang, slug }: { lang: Lang; slug: string }) {
  setLanguage(lang);
  return <DocsPage lang={lang} slug={slug} />;
}

export function docMetadata(lang: Lang, slug: string): Metadata {
  setLanguage(lang);
  const doc = docAt(slug);
  const path = `/docs/${doc?.slug ?? slug}/`;
  const alternates = { canonical: lang === "en" ? path : `/${lang}${path}`, languages: alternatesFor(path, DOCS_LANGS) };
  if (lang === "en") return { title: doc?.title ?? "Documentation", alternates };
  return { title: doc ? `${t(doc.title)} — mozg` : undefined, description: doc ? t(doc.lede) : undefined, alternates };
}

/** Every page but the first, which has its own file. */
export function docParams(): { slug: string[] }[] {
  return DOCS.filter((doc) => doc.slug).map((doc) => ({ slug: [doc.slug] }));
}
