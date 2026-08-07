import Link from "next/link";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import { query } from "@/db";
import { formatCents } from "@/lib/money-math";
import { PLANS, PLAN_PRICE_CENTS } from "@/lib/plans";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "For slot studios — mozg",
  description:
    "The brains a slot studio's agents actually reach for — approval, compliance, the RGS contract, the math SDK — on five seats and one shared allowance. Every one carries an exam score it did not write.",
};

/**
 * The offer page for the one industry that already uses this hardest.
 *
 * It is deliberately built from the live catalogue rather than from a list
 * typed into the page: the scores ARE the pitch, and a score typed by hand is
 * the exact failure this product was written against. If a brain slips, this
 * page says so the next time it renders.
 */

/** The two families plus the brains that sit outside one. */
const PACK = ["stake-engine", "slot-studio"];
const LOOSE = [
  "slot-studio-compliance",
  "slot-animation-craft",
  "slot-art-direction",
  "pixijs-casino",
  "spine-2d-animation",
];

interface PackBrain {
  slug: string;
  title: string;
  goal: string | null;
  score: number | null;
  note_count: number;
  handle: string | null;
  parent: string | null;
}

export default async function StudiosPage() {
  const brains = await query<PackBrain>(
    `select b.slug, b.title, b.goal, b.score, b.note_count, u.handle, p.slug as parent
       from brains b
       left join "user" u on u.id = b.owner_id
       left join brains p on p.id = b.parent_id
      where b.visibility = 'public'
        and (b.slug = any($1) or p.slug = any($1) or b.slug = any($2))
      order by b.score desc nulls last`,
    [PACK, LOOSE],
  );

  const scored = brains.filter((b) => b.score !== null);
  const notes = brains.reduce((n, b) => n + b.note_count, 0);
  const median =
    scored.length > 0
      ? scored.map((b) => b.score!).sort((a, b) => a - b)[Math.floor(scored.length / 2)]
      : null;
  const seats = PLANS.studio.seats;
  const perSeat = Math.round(PLAN_PRICE_CENTS.studio / seats);

  return (
    <>
      <TopBar />
      <Contents active="/studios" />

      <main className="shell" style={{ paddingBlock: "clamp(2.5rem, 7vw, 4.5rem)" }}>
        <p className="eyebrow">For slot studios</p>
        <h1
          className="display"
          style={{ fontSize: "clamp(2rem, 6.5vw, 4rem)", margin: ".5rem 0 1rem" }}
        >
          A failed submission
          <br />
          costs more than a year of this.
        </h1>
        <p className="lede" style={{ maxWidth: "58ch" }}>
          The rejection arrives with a line number and no context. Somebody
          re-reads the approval rules, somebody else argues about what the RGS
          contract actually said, and the build slips a fortnight — again, over
          something that was written down the whole time.
        </p>
        <p style={{ maxWidth: "58ch", marginTop: "1rem" }}>
          These are {brains.length} brains your agents query over MCP instead of
          guessing: the approval checklist, the compliance rules per
          jurisdiction, the RGS lifecycle, the math SDK, the animation and art
          direction. {notes.toLocaleString("en-US")} notes.{" "}
          {median !== null && (
            <>
              Median exam score <strong>{median}</strong> — and every failed
              question is listed publicly, so the agent is told the gaps before
              it searches.
            </>
          )}
        </p>

        <p style={{ marginTop: "1.5rem", display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
          <Link className="btn" href="/settings#plan">
            Take a studio — {formatCents(PLAN_PRICE_CENTS.studio)}/mo
          </Link>
          <Link className="btn btn-ghost" href="/explore?topic=igaming">
            Read the brains first
          </Link>
        </p>

        {/* ── what is in it ─────────────────────────────────────────────── */}
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

        {/* ── seats ─────────────────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <h2 className="h2">{seats} seats, one allowance</h2>
          <p style={{ maxWidth: "58ch", margin: ".5rem 0 1rem" }}>
            A seat is an invitation to the studio, not to a brain. Your maths
            person, your frontend, your artist and your producer each connect
            their own agent with their own token, and all of it comes out of one
            month —{" "}
            {PLANS.studio.calls.toLocaleString("en-US")} calls, not five separate
            allowances to keep an eye on. Add a brain on Tuesday and everybody
            has it on Tuesday.
          </p>
          <p style={{ maxWidth: "58ch", color: "var(--ink-2)" }}>
            {formatCents(PLAN_PRICE_CENTS.studio)} a month, which is{" "}
            {formatCents(perSeat)} a seat, which is less than the meeting you
            hold to decide whether the rules changed. A month at a time —
            nothing renews on its own.
          </p>
        </section>

        {/* ── what it is not ────────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <h2 className="h2">What this is not</h2>
          <p style={{ maxWidth: "58ch", margin: ".5rem 0 1rem" }}>
            It is not certification, and it is not advice: a brain answers from
            what it was taught and says so, and the exam measures whether the
            answer was in there — not whether the regulator agrees. It is not a
            replacement for reading the contract before you sign it.
          </p>
          <p style={{ maxWidth: "58ch" }}>
            What it removes is the other failure: an agent that answers about
            approval rules with total confidence and no source, because
            something in its training data sounded close enough.
          </p>
        </section>

        <p style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)", display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
          <Link className="btn" href="/settings#plan">
            Take a studio — {formatCents(PLAN_PRICE_CENTS.studio)}/mo
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
