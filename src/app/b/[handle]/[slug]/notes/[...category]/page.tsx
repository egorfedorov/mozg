import Link from "next/link";
import { notFound } from "next/navigation";
import { translator } from "@/lib/t";
import { markup } from "@/lib/markup";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import { notesIn, openBrain, THIN_CATEGORY } from "@/lib/public-notes";

export const dynamic = "force-dynamic";

/**
 * One subject of one free brain, in full.
 *
 * The page a search engine and an assistant can actually answer from, and the
 * reason the category is the unit rather than the note: a note is often two
 * sentences, and 116,587 pages of those is a thin-content farm however true
 * each one is. Grouped, the same corpus is 3,281 substantial pages.
 *
 * A section under THIN_CATEGORY notes still renders — somebody followed a link
 * to it — but carries noindex, so the crawler's budget goes to the pages that
 * hold something.
 */

function decode(parts: string[]): string {
  return parts.map(decodeURIComponent).join("/");
}

function href(handle: string, slug: string, category: string[], page?: number): string {
  const path = `/b/${handle}/${slug}/notes/${category.map(encodeURIComponent).join("/")}`;
  return page && page > 1 ? `${path}?page=${page}` : path;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string; slug: string; category: string[] }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { handle, slug, category } = await params;
  const brain = await openBrain(handle, slug);
  if (!brain) return {};

  const page = Number((await searchParams).page) || 1;
  const name = decode(category);
  const { notes, total, pages } = await notesIn(brain.id, name, page);
  if (!notes.length) return {};

  return {
    title: pages > 1 ? `${name} (${page}/${pages}) — ${brain.title}` : `${name} — ${brain.title}`,
    description: notes[0].body.slice(0, 155),
    // Each page is its own canonical: they hold different notes, so folding
    // them onto page one would ask a crawler to ignore most of the material.
    alternates: { canonical: href(handle, slug, category, page) },
    // Thin sections are readable but not worth a crawl.
    ...(total < THIN_CATEGORY ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function CategoryNotes({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string; slug: string; category: string[] }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const t = await translator();
  const { handle, slug, category } = await params;

  const brain = await openBrain(handle, slug);
  if (!brain) notFound();

  const page = Number((await searchParams).page) || 1;
  const name = decode(category);
  const { notes, total, pages } = await notesIn(brain.id, name, page);
  if (!notes.length) notFound();

  return (
    <>
      <TopBar />
      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">
          <Link href={`/b/${handle}/${slug}`} style={{ textDecoration: "underline" }}>
            {brain.title}
          </Link>{" "}
          ·{" "}
          <Link href={`/b/${handle}/${slug}/notes`} style={{ textDecoration: "underline" }}>
            {t("all subjects")}
          </Link>
        </p>
        <h1
          className="display"
          style={{ fontSize: "clamp(1.7rem, 4.5vw, 2.8rem)", margin: ".4rem 0 .9rem" }}
        >
          {name}
        </h1>
        <p style={{ maxWidth: "58ch", color: "var(--ink-2)", marginTop: 0 }}>
          {pages > 1
            ? markup(
                t("<0/> notes in this subject, read out of <1>this brain</1> and free to use. This is page <2/> of <3/>."),
                [total, <Link href={`/b/${handle}/${slug}`} key="s1" />, page, pages],
              )
            : markup(
                t("<0/> notes, read out of <1>this brain</1> and free to use. Each one was extracted from a source and is re-checked against its exam."),
                [total, <Link href={`/b/${handle}/${slug}`} key="s1" />],
              )}
        </p>

        <div style={{ display: "grid", gap: "1.5rem", marginTop: "2.25rem", maxWidth: "62ch" }}>
          {notes.map((n) => (
            <article key={n.id}>
              <h2 className="h2" style={{ fontSize: "1.1rem", margin: "0 0 .35rem" }}>
                {n.title}
              </h2>
              {/* Notes are written as prose with hard line breaks; preserving
                  them keeps lists and step sequences readable without asking
                  the extractor to emit markup. */}
              <p style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--ink-2)" }}>{n.body}</p>
            </article>
          ))}
        </div>

        {pages > 1 && (
          <nav
            style={{ display: "flex", gap: "1rem", marginTop: "2.5rem", alignItems: "center" }}
            aria-label={t("pages")}
          >
            {page > 1 && (
              <Link className="navlink" href={href(handle, slug, category, page - 1)}>
                {t("← previous")}
              </Link>
            )}
            <span className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-3)" }}>
              {page} / {pages}
            </span>
            {page < pages && (
              <Link className="navlink" href={href(handle, slug, category, page + 1)}>
                {t("next →")}
              </Link>
            )}
          </nav>
        )}

        <p style={{ marginTop: "3rem" }}>
          <Link className="btn" href="/connect">
            {t("Give your agent this brain")}
          </Link>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
