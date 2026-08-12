import { translator } from "@/lib/t";
import { notFound } from "next/navigation";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import { currentUser } from "@/lib/session";
import { findWorkflow } from "@/lib/workflow-store";
import { formatCents } from "@/lib/money-math";
import { shelfFor } from "@/lib/route-shelf";
import { offerFor, packFor } from "@/lib/route-cost";
import EquipRoute from "./EquipRoute";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}) {
  const { handle, slug } = await params;
  const w = await findWorkflow(`${handle}/${slug}`, null);
  return {
    title: w ? `${w.title} — mozg` : "Workflow — mozg",
    description: w?.summary ?? undefined,
  };
}

/**
 * The public face of a route.
 *
 * Two audiences on one page and they want opposite things: somebody deciding
 * whether to run it needs the shape — how many steps, which brains, what it
 * costs to have them — and somebody about to run it needs every prompt and
 * rule verbatim. So the shelf comes first as a list of brains with their
 * scores and prices, and the steps follow in full underneath. Nothing is
 * hidden: a route is trusted on whether its steps are the right ones, and a
 * page that hid them would be asking for faith.
 */
export default async function PublicWorkflowPage({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}) {
  const t = await translator();
  const { handle, slug } = await params;

  const user = await currentUser();
  const w = await findWorkflow(`${handle}/${slug}`, user?.id ?? null);
  if (!w) notFound();

  // Resolved once, by the function the buy button and workflow_read also use,
  // so the price on this page, the price it charges and the shelf an agent
  // insists on are the same answer rather than three that agree today.
  const { brains, unknown, missing, unshelved, ready } = await shelfFor(
    w.steps,
    user?.id ?? null,
  );

  const priced = (b: (typeof brains)[number]) => ({
    slug: b.slug,
    parentSlug: b.parent_slug,
    priceCents: b.price_cents,
  });
  const scoreOf = (name: string) =>
    brains.find((b) => b.slug.toLowerCase() === name.split("/").pop()!.toLowerCase())
      ?.score ?? null;
  const offer = offerFor(missing.map(priced));
  // What a reader starting from nothing would pay — the headline number, and
  // the same arithmetic, so it can never quote more than the button charges.
  const fullOffer = offerFor(brains.map(priced));
  const steps = w.steps;
  const withChecks = steps.filter((s) => s.done_when).length;

  return (
    <>
      <TopBar />
      <Contents active="/build" />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">
          {t("Workflow")} · {handle}/{slug}
        </p>
        <h1
          className="display"
          style={{ fontSize: "clamp(1.9rem, 5vw, 3.2rem)", margin: ".4rem 0 .9rem" }}
        >
          {w.title}
        </h1>
        {w.summary && (
          <p style={{ maxWidth: "58ch", color: "var(--ink-2)", fontSize: "1.05rem", marginTop: 0 }}>
            {w.summary}
          </p>
        )}

        <div className="stats" style={{ marginTop: "1.75rem" }}>
          <div className="stat">
            <span className="eyebrow">{t("Steps")}</span>
            <span className="stat-value">{steps.length}</span>
          </div>
          <div className="stat">
            <span className="eyebrow">{t("Brains it reads")}</span>
            <span className="stat-value">{brains.length + unknown.length}</span>
          </div>
          <div className="stat">
            <span className="eyebrow">{t("Steps with a check")}</span>
            <span className="stat-value">{withChecks}</span>
          </div>
          <div className="stat">
            {/* Signed in, the number is what is LEFT to get; signed out it is
                the whole shelf. Both go through the same pack arithmetic, so
                neither can quote more than the button charges. */}
            <span className="eyebrow">
              {user && ready ? t("The shelf") : t("The shelf costs")}
            </span>
            <span className="stat-value">
              {user && ready
                ? t("Ready")
                : (user ? offer : fullOffer).totalCents > 0
                  ? formatCents((user ? offer : fullOffer).totalCents)
                  : t("Free")}
            </span>
          </div>
        </div>

        {/* The route itself is free, and saying so beside a price stops the
            number above reading as a fee for the steps. */}
        <p style={{ color: "var(--ink-2)", maxWidth: "58ch", marginTop: "1rem" }}>
          {fullOffer.totalCents === 0
            ? t("The route is free, and so is everything it reads. Connect mozg and run it.")
            : fullOffer.packs.length
              ? t("The route is free — it is the order the reading happens in, and charging for an order is charging twice. What costs money is the shelf under it, and most of that comes as a pack, which is cheaper than the same brains bought one at a time.")
              : t("The route is free — it is the order the reading happens in, and charging for an order is charging twice. What costs money is the shelf under it.")}
        </p>

        <div className="panel" style={{ marginTop: "1.25rem" }}>
          <p className="eyebrow" style={{ marginTop: 0 }}>
            {t("Run it from any agent with mozg connected")}
          </p>
          <pre className="mono" style={{ margin: ".4rem 0 0", overflowX: "auto" }}>
            <code>
              /mozg:build {handle}/{slug}
            </code>
          </pre>
          <p style={{ color: "var(--ink-2)", margin: ".6rem 0 0", fontSize: ".9375rem" }}>
            {user && ready
              ? t("Your shelf has everything this route reads, so it runs.")
              : t("It will not run until every brain below is open to you. A step whose brain is missing does not stop — it answers from the model's own training in this route's voice, which is the failure the route was written to prevent.")}
          </p>
        </div>

        {/* ── what you need before you start ────────────────────────────── */}
        <h2 className="h2" style={{ marginTop: "2.5rem" }}>
          {t("The shelf this route needs")}
        </h2>
        <p style={{ color: "var(--ink-2)", maxWidth: "58ch", marginTop: 0 }}>
          {t("Your agent reads these as it goes, so the route is held closed until all of them are open to you. One missing brain does not stop a step — it makes the step guess, and a guess wearing this route's authority is worse than no route at all.")}
        </p>
        <div className="rows">
          {brains.map((b) => (
            <Link className="row" key={b.id} href={`/b/${b.owner_handle}/${b.slug}`}>
              <span style={{ minWidth: 0 }}>
                <strong>{b.title}</strong>
                <span className="row-sub">
                  {b.owner_handle}/{b.slug}
                </span>
                <span className="row-meta">
                  {(b.note_count + b.child_notes).toLocaleString()} {t("notes")}
                  {b.score !== null ? ` · ${b.score}% ${t("on its exam")}` : ` · ${t("unexamined")}`}
                </span>
              </span>
              <span className="row-side">
                {/* A brain a pack opens is never quoted its own price here:
                    that number is one the reader would never actually pay,
                    and five of them added up is where the $200 came from. */}
                {b.held
                  ? t("On your shelf")
                  : packFor(user ? offer : fullOffer, b.slug)
                    ? t("In the pack")
                    : b.price_cents > 0
                      ? formatCents(b.price_cents)
                      : t("Free")}
              </span>
            </Link>
          ))}
          {/* A name no public brain answers to. Never silently dropped: it is
              why the route is held closed, and a reader who cannot see it has
              a page saying "not ready" and nothing to buy. */}
          {unknown.map((name) => (
            <div className="row" key={name}>
              <span style={{ minWidth: 0 }}>
                <strong>{name}</strong>
                <span className="row-sub">
                  {t("Not in the public catalogue under that name — it may be private, or renamed since this route was written. Ask the route's author.")}
                </span>
              </span>
              <span className="row-side">{t("Unavailable")}</span>
            </div>
          ))}
        </div>

        <EquipRoute
          handle={handle}
          slug={slug}
          costCents={offer.totalCents}
          // Free brains still worth one click, even when nothing is owed.
          missing={missing.length + unshelved.length}
          packs={offer.packs.map((p) => ({
            title: t(p.title),
            priceCents: p.priceCents,
            covers: p.covers.length,
          }))}
          singles={offer.brains.length}
        />

        {/* ── the route itself ──────────────────────────────────────────── */}
        <h2 className="h2" style={{ marginTop: "2.5rem" }}>
          {t("The route, step by step")}
        </h2>

        <ol className="wf-steps">
          {steps.map((s, i) => (
            <li key={i} className="wf-step">
              <span className="wf-step-n">{i + 1}</span>
              <div className="wf-step-body">
                <h3 className="wf-step-title">{s.title}</h3>
                {s.brain && (
                  <p className="wf-step-brain mono">
                    {t("reads")} {s.brain}
                    {scoreOf(s.brain) !== null && ` · ${scoreOf(s.brain)}%`}
                  </p>
                )}
                {s.ask && (
                  <p className="wf-step-line">
                    <span className="wf-step-tag">{t("asks")}</span>
                    {s.ask}
                  </p>
                )}
                {s.rules && (
                  <p className="wf-step-line">
                    <span className="wf-step-tag" data-kind="rule">
                      {t("rules")}
                    </span>
                    {s.rules}
                  </p>
                )}
                {s.done_when && (
                  <p className="wf-step-line">
                    <span className="wf-step-tag" data-kind="check">
                      {t("done when")}
                    </span>
                    {s.done_when}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>

        <div
          className="panel"
          style={{ marginTop: "2.5rem", display: "flex", gap: "1.25rem", flexWrap: "wrap", alignItems: "center" }}
        >
          <div style={{ flex: "1 1 28ch" }}>
            <h2 className="h2" style={{ margin: 0 }}>
              {t("Write your own route.")}
            </h2>
            <p style={{ color: "var(--ink-2)", margin: ".4rem 0 0" }}>
              {t("The order your team already works in, written down once, runnable from anyone's terminal.")}
            </p>
          </div>
          <Link className="btn" href="/workflows">
            {t("Build one")}
          </Link>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
