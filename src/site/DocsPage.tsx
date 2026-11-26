import CopyButton from "@/components/CopyButton";
import Blocks from "@/components/docs/Blocks";
import DocSearch from "@/components/docs/DocSearch";
import Announcements from "@/components/site/Announcements";
import SiteFooter from "@/components/SiteFooter";
import TopBar from "@/components/TopBar";
import { DOCS, DOC_GROUPS, docAt, neighbours } from "@/content/docs";
import { docMarkdown } from "@/lib/doc-markdown";
import { notFound } from "next/navigation";
import { t, type Lang } from "@/lib/i18n";
import { DOCS_LANGS, sitePath } from "@/site/paths";

/**
 * One page of the documentation.
 *
 * Three columns on a wide screen: the way around on the left, the page in the
 * middle, and what is on it on the right. On a narrow one the page first, and
 * the way around folded above it.
 */
export default function DocsPage({ lang, slug }: { lang: Lang; slug: string }) {
  const doc = docAt(slug);
  if (!doc) notFound();
  const { previous, next } = neighbours(doc);
  const base = sitePath(lang, "/docs/");
  // The first page has no slug of its own: it is the folder itself.
  const here = (page: string) => (page ? `${base}${page}/` : base);
  const groups = DOC_GROUPS.map((group) => ({ group, pages: DOCS.filter((d) => d.group === group) }));
  const headings = doc.blocks.flatMap((b) => (b.kind === "h" ? [{ id: b.id, text: t(b.text) }] : []));

  return (
    <>
      <Announcements lang={lang} close={t("Close")} />
      <TopBar lang={lang} path={doc.slug ? `/docs/${doc.slug}/` : "/docs/"} surface="docs" />
      <div className="shell docs">
        <aside className="docs-side">
          <DocSearch
            base={base}
            index={DOCS.map((d) => ({
              slug: d.slug,
              title: t(d.title),
              group: t(d.group),
              headings: d.blocks.flatMap((b) => (b.kind === "h" ? [{ id: b.id, text: t(b.text) }] : [])),
            }))}
            labels={{ search: t("Search"), title: t("Search the documentation"), empty: t("Nothing found."), inGroup: t("in") }}
          />
          <details className="docs-nav-fold">
            <summary>{t("All pages")}</summary>
            <nav aria-label={t("Documentation pages")}>
              {groups.map((g) => (
                <div key={g.group} className="docs-group">
                  <p className="eyebrow">{t(g.group)}</p>
                  <ul>
                    {g.pages.map((d) => (
                      <li key={d.slug}>
                        <a href={here(d.slug)} aria-current={d === doc ? "page" : undefined}>
                          {t(d.title)}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </details>
          <nav className="docs-nav" aria-label={t("Documentation pages")}>
            {groups.map((g) => (
              <div key={g.group} className="docs-group">
                <p className="eyebrow">{t(g.group)}</p>
                <ul>
                  {g.pages.map((d) => (
                    <li key={d.slug}>
                      <a href={here(d.slug)} aria-current={d === doc ? "page" : undefined}>
                        {t(d.title)}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <article className="docs-article">
          <p className="eyebrow">{t(doc.group)}</p>
          <h1 className="h1">{t(doc.title)}</h1>
          <p className="lede">{t(doc.lede)}</p>
          <div className="docs-tools">
            <CopyButton text={docMarkdown(doc)} label={t("Copy as Markdown")} copied={t("Copied as Markdown")} className="btn btn-sm btn-ghost" />
          </div>
          <Blocks blocks={doc.blocks} />
          <nav className="docs-pager" aria-label={t("More pages")}>
            {previous ? (
              <a href={here(previous.slug)} className="docs-pager-link" rel="prev">
                <span className="eyebrow">← {t("Previous")}</span>
                {t(previous.title)}
              </a>
            ) : (
              <span />
            )}
            {next ? (
              <a href={here(next.slug)} className="docs-pager-link docs-pager-next" rel="next">
                <span className="eyebrow">{t("Next")} →</span>
                {t(next.title)}
              </a>
            ) : (
              <span />
            )}
          </nav>
        </article>

        <aside className="docs-toc">
          <p className="eyebrow">{t("On this page")}</p>
          {headings.length > 0 && (
            <ul>
              {headings.map((h) => (
                <li key={h.id}>
                  <a href={`#${h.id}`}>{h.text}</a>
                </li>
              ))}
            </ul>
          )}
          <a className="btn btn-sm" href={`${sitePath(lang, "/")}#install`}>
            {t("Install the plugin")}
          </a>
        </aside>
      </div>
      <SiteFooter lang={lang} />
    </>
  );
}

/** For a page's address: every language that has the documentation. */
export const docsLanguages = DOCS_LANGS;
