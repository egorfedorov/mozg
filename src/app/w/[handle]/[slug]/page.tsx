import { translator } from "@/lib/t";
import { notFound } from "next/navigation";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import { query } from "@/db";
import { currentUser } from "@/lib/session";
import { findWorkflow } from "@/lib/workflow-store";
import { formatCents } from "@/lib/money-math";

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

  // The brains the route names, as the catalogue knows them. Matched on slug
  // because a step may write either "handle/slug" or the bare slug, and the
  // shelf is what the reader will have to assemble either way.
  const wanted = [...new Set(w.steps.map((s) => s.brain).filter(Boolean))].map((b) =>
    String(b).split("/").pop()!.toLowerCase(),
  );

  const brains = wanted.length
    ? await query<{
        slug: string;
        title: string;
        owner_handle: string;
        score: number | null;
        price_cents: number;
        note_count: number;
        child_notes: number;
        visibility: string;
      }>(
        `select b.slug, b.title, u.handle as owner_handle, b.score, b.price_cents,
                b.note_count,
                (select coalesce(sum(c.note_count), 0)::int from brains c
                  where c.parent_id = b.id) as child_notes,
                b.visibility
           from brains b join "user" u on u.id = b.owner_id
          where lower(b.slug) = any($1::text[]) and b.visibility = 'public'`,
        [wanted],
      )
    : [];

  const bySlug = new Map(brains.map((b) => [b.slug.toLowerCase(), b]));
  const toBuy = brains.filter((b) => b.price_cents > 0);
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
            <span className="stat-value">{wanted.length}</span>
          </div>
          <div className="stat">
            <span className="eyebrow">{t("Steps with a check")}</span>
            <span className="stat-value">{withChecks}</span>
          </div>
          <div className="stat">
            <span className="eyebrow">{t("To buy")}</span>
            <span className="stat-value">
              {toBuy.length
                ? formatCents(toBuy.reduce((n, b) => n + b.price_cents, 0))
                : t("Free")}
            </span>
          </div>
        </div>

        <div className="panel" style={{ marginTop: "1.25rem" }}>
          <p className="eyebrow" style={{ marginTop: 0 }}>
            {t("Run it from any agent with mozg connected")}
          </p>
          <pre className="mono" style={{ margin: ".4rem 0 0", overflowX: "auto" }}>
            <code>
              /mozg:build {handle}/{slug}
            </code>
          </pre>
        </div>

        {/* ── what you need before you start ────────────────────────────── */}
        <h2 className="h2" style={{ marginTop: "2.5rem" }}>
          {t("The shelf this route needs")}
        </h2>
        <p style={{ color: "var(--ink-2)", maxWidth: "58ch", marginTop: 0 }}>
          {t("Your agent reads these as it goes. A brain you do not have is not a blocker — the step still runs, it just runs on guesswork, which is the thing this route exists to avoid.")}
        </p>
        <div className="rows">
          {wanted.map((slugKey) => {
            const b = bySlug.get(slugKey);
            if (!b) {
              return (
                <div className="row" key={slugKey}>
                  <span style={{ minWidth: 0 }}>
                    <strong>{slugKey}</strong>
                    <span className="row-sub">
                      {t("Not in the public catalogue — the route's author may keep it private.")}
                    </span>
                  </span>
                </div>
              );
            }
            return (
              <Link className="row" key={slugKey} href={`/b/${b.owner_handle}/${b.slug}`}>
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
                  {b.price_cents > 0 ? formatCents(b.price_cents) : t("Free")}
                </span>
              </Link>
            );
          })}
        </div>

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
                    {bySlug.get(String(s.brain).split("/").pop()!.toLowerCase())?.score != null &&
                      ` · ${bySlug.get(String(s.brain).split("/").pop()!.toLowerCase())!.score}%`}
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
