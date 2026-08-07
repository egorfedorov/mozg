import Link from "next/link";
import { notFound } from "next/navigation";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import { formatCents } from "@/lib/money-math";
import { PACKS, packBySlug } from "@/lib/packs";
import { brainsIn, statsOf } from "@/lib/pack-brains";

export const dynamic = "force-dynamic";

/**
 * One pack's offer page.
 *
 * The copy that differs by trade lives in lib/packs.ts; the numbers are read
 * from the catalogue at render time. So a second pack is a data change, and a
 * brain whose score slips says so here the next time somebody loads the page —
 * which is the only version of this page worth publishing.
 */

export function generateStaticParams() {
  return PACKS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const pack = packBySlug((await params).slug);
  if (!pack) return {};
  return {
    title: `${pack.title} — mozg`,
    description: `The brains a ${pack.title.toLowerCase().replace(/s$/, "")}'s agents actually reach for: ${pack.covers}. Every one carries an exam score it did not write.`,
  };
}

export default async function PackPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const pack = packBySlug((await params).slug);
  if (!pack) notFound();

  const brains = await brainsIn(pack);
  const { notes, median } = statsOf(brains);
  const perSeat = Math.round(pack.priceCents / pack.seats);

  return (
    <>
      <TopBar />
      <Contents active="/packs" />

      <main className="shell" style={{ paddingBlock: "clamp(2.5rem, 7vw, 4.5rem)" }}>
        <p className="eyebrow">
          <Link href="/packs" style={{ textDecoration: "underline" }}>
            Packs
          </Link>{" "}
          · {pack.eyebrow}
        </p>
        <h1
          className="display"
          style={{ fontSize: "clamp(2rem, 6.5vw, 4rem)", margin: ".5rem 0 1rem" }}
        >
          {pack.headline[0]}
          <br />
          {pack.headline[1]}
        </h1>
        <p className="lede" style={{ maxWidth: "58ch" }}>
          {pack.lede}
        </p>
        <p style={{ maxWidth: "58ch", marginTop: "1rem" }}>
          These are {brains.length} brains your agents query over MCP instead of
          guessing: {pack.covers}. {notes.toLocaleString("en-US")} notes.{" "}
          {median !== null && (
            <>
              Median exam score <strong>{median}</strong> — and every failed
              question is listed publicly, so the agent is told the gaps before
              it searches.
            </>
          )}
        </p>

        <p style={{ marginTop: "1.5rem", display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
          <Link className="btn" href="/settings/packs">
            Buy the pack — {formatCents(pack.priceCents)} once
          </Link>
          <Link className="btn btn-ghost" href="/explore">
            Read the brains first
          </Link>
        </p>

        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <h2 className="h2">What your agents get to read</h2>
          <p style={{ color: "var(--ink-2)", maxWidth: "58ch", margin: ".5rem 0 1.25rem" }}>
            Scores are read live from the catalogue when this page renders. They
            move — that is the point of having them.
          </p>

          <div className="rows">
            {brains.map((b) => (
              <Link
                key={b.slug}
                className="row"
                href={b.handle ? `/b/${b.handle}/${b.slug}` : "/explore"}
              >
                <span style={{ minWidth: 0 }}>
                  <strong>{b.title}</strong>
                  {b.goal && <span className="row-sub">{b.goal}</span>}
                  <span className="row-meta">
                    {b.note_count.toLocaleString("en-US")} notes
                    {b.parent ? ` · part of ${b.parent}` : ""}
                  </span>
                </span>
                <span className="row-side">{b.score !== null ? `${b.score}%` : "unscored"}</span>
              </Link>
            ))}
          </div>
        </section>

        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <h2 className="h2">Bought once, shared {pack.seats} ways</h2>
          <p style={{ maxWidth: "58ch", margin: ".5rem 0 1rem" }}>
            {formatCents(pack.priceCents)}, one time — {formatCents(perSeat)} a
            head. It does not renew and it does not expire, and when a brain in
            the pack learns something new you have it without paying again.
          </p>
          <p style={{ maxWidth: "58ch", margin: "0 0 1rem" }}>
            {pack.team}. The seat shares the reading, not the allowance: how
            much each of you can teach and how many calls you may make is still
            your own plan, so a colleague who works this hard ends up on their
            own <Link href="/pricing">pro</Link> rather than quietly spending
            yours.
          </p>
        </section>

        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <h2 className="h2">What this is not</h2>
          <p style={{ maxWidth: "58ch", margin: ".5rem 0 1rem" }}>{pack.caveat}</p>
          <p style={{ maxWidth: "58ch" }}>
            What it removes is the other failure: an agent that answers with
            total confidence and no source, because something in its training
            data sounded close enough.
          </p>
        </section>

        <p style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)", display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
          <Link className="btn" href="/settings/packs">
            Buy the pack — {formatCents(pack.priceCents)} once
          </Link>
          <Link className="btn btn-ghost" href="/chat">
            Ask a person first
          </Link>
        </p>
      </main>

      <SiteFooter />
    </>
  );
}
