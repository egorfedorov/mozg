import Link from "next/link";
import { markup } from "@/lib/markup";
import { translator } from "@/lib/t";
import { notFound } from "next/navigation";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import { formatCents } from "@/lib/money-math";
import { PACKS, packBySlug } from "@/lib/packs";
import { brainsIn, statsOf } from "@/lib/pack-brains";
import { contradictionsIn, lastJudgedIn } from "@/lib/contradictions";

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
  const t = await translator();

  const pack = packBySlug((await params).slug);
  if (!pack) notFound();

  const brains = await brainsIn(pack);
  const { notes, median } = statsOf(brains);
  const perSeat = Math.round(pack.priceCents / pack.seats);

  const brainIds = brains.map((b) => b.id);
  const [clashes, lastJudged] = await Promise.all([
    contradictionsIn(brainIds),
    lastJudgedIn(brainIds),
  ]);

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
        {/* Two sentences, and the second only exists once something has been
            scored. Written as two whole strings rather than one with a hole in
            it: a conditional clause spliced into the middle of a sentence is
            the fragment problem wearing a different hat. */}
        <p style={{ maxWidth: "58ch", marginTop: "1rem" }}>
          {markup(
            t(
              "These are <0/> brains your agents query over MCP instead of guessing: <1/>. <2/> notes.",
            ),
            [brains.length, pack.covers, notes.toLocaleString("en-US")],
          )}{" "}
          {median !== null &&
            markup(
              t(
                "Median exam score <0/> — and every failed question is listed publicly, so the agent is told the gaps before it searches.",
              ),
              [<strong key="s0">{median}</strong>],
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
          <h2 className="h2">{t("What your agents get to read")}</h2>
          <p style={{ color: "var(--ink-2)", maxWidth: "58ch", margin: ".5rem 0 1.25rem" }}>
            {t("Scores are read live from the catalogue when this page renders. They move — that is the point of having them.")}</p>

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

        {/*
          The disagreements, printed on the sales page.
          Publishing them is the argument, not a caveat to it: a pack whose
          brains never appeared to conflict would only mean nobody was
          checking, and an agent holding one side of an unresolved argument
          with no idea there is another side is the exact failure the rest of
          this page is sold against. Every conflict here is also flagged in
          brain_search, so the buyer's agent meets it mid-answer.
        */}
        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <h2 className="h2">{t("Where these brains disagree")}</h2>
          {clashes.length > 0 ? (
            <>
              <p style={{ color: "var(--ink-2)", maxWidth: "58ch", margin: ".5rem 0 1.25rem" }}>
                {t("Different sources, read every night for places where two of them answer the same question differently. Nothing is merged and nothing is quietly picked: your agent is handed both sides, with the brain each came from.")}</p>
              <div className="rows">
                {clashes.map((c) => (
                  <div className="row" key={c.id}>
                    <span style={{ minWidth: 0 }}>
                      <strong>{c.subject}</strong>
                      <span className="row-sub">
                        {c.a.brain_slug}: {c.a.claim}
                      </span>
                      <span className="row-sub">
                        {c.b.brain_slug}: {c.b.claim}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            // Whole sentences, never fragments joined around a variable — a
            // translator handed "The last pass, on" returns something that only
            // reads as a sentence in English. The date carries its own label.
            <p style={{ color: "var(--ink-2)", maxWidth: "58ch", margin: ".5rem 0 0" }}>
              {t("Every night these brains are read against each other for places where two of them answer the same question differently.")}{" "}
              {lastJudged ? (
                <>
                  {t("None are open.")} {t("Last pass:")} {lastJudged}.
                </>
              ) : (
                t("The first pass has not run yet.")
              )}
            </p>
          )}
        </section>

        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <h2 className="h2">{markup(t("Bought once, shared <0/> ways"), [
            pack.seats,
          ])}</h2>
          <p style={{ maxWidth: "58ch", margin: ".5rem 0 1rem" }}>
            {markup(t("<0/>, one time — <1/> a head. It does not renew and it does not expire, and when a brain in the pack learns something new you have it without paying again."), [
            formatCents(pack.priceCents),
            formatCents(perSeat),
          ])}</p>
          <p style={{ maxWidth: "58ch", margin: "0 0 1rem" }}>
            {markup(t("<0/>. The seat shares the reading, not the allowance: how much each of you can teach and how many calls you may make is still your own plan, so a colleague who works this hard ends up on their own <1>pro</1> rather than quietly spending yours."), [
            pack.team,
            <Link href="/pricing" key="s1" />,
          ])}</p>
        </section>

        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <h2 className="h2">{t("What this is not")}</h2>
          <p style={{ maxWidth: "58ch", margin: ".5rem 0 1rem" }}>{pack.caveat}</p>
          <p style={{ maxWidth: "58ch" }}>
            {t("What it removes is the other failure: an agent that answers with total confidence and no source, because something in its training data sounded close enough.")}</p>
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
