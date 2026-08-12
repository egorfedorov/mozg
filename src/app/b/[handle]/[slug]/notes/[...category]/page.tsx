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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string; slug: string; category: string[] }>;
}) {
  const { handle, slug, category } = await params;
  const brain = await openBrain(handle, slug);
  if (!brain) return {};
  const name = decode(category);
  const notes = await notesIn(brain.id, name);
  if (!notes.length) return {};

  return {
    title: `${name} — ${brain.title}`,
    description: notes[0].body.slice(0, 155),
    alternates: {
      canonical: `/b/${handle}/${slug}/notes/${category.map(encodeURIComponent).join("/")}`,
    },
    // Thin sections are readable but not worth a crawl.
    ...(notes.length < THIN_CATEGORY ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function CategoryNotes({
  params,
}: {
  params: Promise<{ handle: string; slug: string; category: string[] }>;
}) {
  const t = await translator();
  const { handle, slug, category } = await params;

  const brain = await openBrain(handle, slug);
  if (!brain) notFound();

  const name = decode(category);
  const notes = await notesIn(brain.id, name);
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
          {markup(
            t("<0/> notes, read out of <1>this brain</1> and free to use. Each one was extracted from a source and is re-checked against its exam."),
            [notes.length, <Link href={`/b/${handle}/${slug}`} key="s1" />],
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
