import Link from "next/link";
import { notFound } from "next/navigation";
import { translator } from "@/lib/t";
import { markup } from "@/lib/markup";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import { categoriesOf, openBrain, THIN_CATEGORY } from "@/lib/public-notes";

export const dynamic = "force-dynamic";

/**
 * What a free brain actually knows, by subject.
 *
 * The brain's own page is a shop window — fourteen note titles and a score.
 * This is the shelf itself, and it exists because 116,587 notes in 131 free
 * brains were published nowhere at all: the entire indexable surface of the
 * catalogue was 184 pages of description about material nobody could read.
 *
 * Paid brains never reach here — openBrain() asks the paywall, not a second
 * copy of its rules.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}) {
  const { handle, slug } = await params;
  const brain = await openBrain(handle, slug);
  if (!brain) return {};
  return {
    title: `${brain.title} — everything it knows`,
    description:
      brain.goal ??
      `Every note in ${brain.title}, grouped by subject. Free to read, exam-scored.`,
    alternates: { canonical: `/b/${handle}/${slug}/notes` },
  };
}

export default async function BrainNotesIndex({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}) {
  const t = await translator();
  const { handle, slug } = await params;

  const brain = await openBrain(handle, slug);
  if (!brain) notFound();

  const categories = await categoriesOf(brain.id);
  if (!categories.length) notFound();

  const total = categories.reduce((n, c) => n + c.notes, 0);

  return (
    <>
      <TopBar />
      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">
          <Link href={`/b/${handle}/${slug}`} style={{ textDecoration: "underline" }}>
            {brain.title}
          </Link>{" "}
          · {t("everything it knows")}
        </p>
        <h1
          className="display"
          style={{ fontSize: "clamp(1.9rem, 5vw, 3.2rem)", margin: ".4rem 0 .9rem" }}
        >
          {brain.title}
        </h1>
        {brain.goal && (
          <p style={{ maxWidth: "58ch", color: "var(--ink-2)", fontSize: "1.05rem", marginTop: 0 }}>
            {brain.goal}
          </p>
        )}
        <p style={{ maxWidth: "58ch", color: "var(--ink-2)" }}>
          {markup(
            t("<0/> notes across <1/> subjects, free to read. Your agent searches them over MCP instead of guessing — <2>connect it</2>."),
            [total.toLocaleString("en-US"), categories.length, <Link href="/connect" key="s2" />],
          )}
        </p>

        <div className="rows" style={{ marginTop: "2rem" }}>
          {categories.map((c) => (
            <Link
              className="row"
              key={c.category}
              href={`/b/${handle}/${slug}/notes/${c.category.split("/").map(encodeURIComponent).join("/")}`}
            >
              <span style={{ minWidth: 0 }}>
                <strong>{c.category}</strong>
                {c.notes < THIN_CATEGORY && (
                  <span className="row-sub">{t("a short section")}</span>
                )}
              </span>
              <span className="row-side">{c.notes}</span>
            </Link>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
