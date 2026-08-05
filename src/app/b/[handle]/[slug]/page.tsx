import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import BuyBrain from "@/components/BuyBrain";
import AddBrain from "@/components/AddBrain";
import CopyMcpCommand from "./CopyMcpCommand";
import ReviewBox from "./ReviewBox";
import { query } from "@/db";
import { env } from "@/lib/env";
import { accessForSlug } from "@/lib/access";
import { categoryScores, tintFor } from "@/lib/brains";
import { currentUser } from "@/lib/session";
import { topicLabel } from "@/lib/topics";
import { inLibrary } from "@/lib/library";
import { accessibleChildren, parentOf } from "@/lib/families";
import { agentsTaught } from "@/lib/agent-report";
import { gateFor } from "@/lib/paywall";
import { anyCryptoReady } from "@/lib/payments";
import { isoDate } from "@/lib/dates";

/**
 * The public face of a brain. This is the page that gets indexed and shared,
 * so it has to answer "what does this know, and how well" without a sign-in.
 */

const LICENSE: Record<string, { label: string; detail: string }> = {
  nc: {
    label: "CC BY-NC-SA 4.0",
    detail: "Use it, copy it, build on it, with credit. Selling it is not allowed.",
  },
  mit: {
    label: "MIT",
    detail: "Do anything, including reselling or shipping it inside a paid product.",
  },
  proprietary: {
    label: "Closed",
    detail: "Readable through MCP only. No export, no copying.",
  },
};

// Both the page and generateMetadata query the database per request.
export const dynamic = "force-dynamic";

const STATE_SIGIL = { pass: "✓", partial: "▲", fail: "✕", empty: "·" } as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}): Promise<Metadata> {
  const { handle, slug } = await params;
  const found = await accessForSlug(handle, slug, null);
  if (!found?.brain || found.brain.visibility !== "public") return { title: "mozg" };
  const title = `${found.brain.title} — a mozg brain`;
  const description = found.brain.goal ?? undefined;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      // The image is the opengraph-image.tsx in this segment — Next resolves it.
      url: `/b/${handle}/${slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function PublicBrainPage({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}) {
  const { handle, slug } = await params;
  const user = await currentUser();
  const found = await accessForSlug(handle, slug, user?.id ?? null);
  // Locked paid brains still render — as a storefront, not as content.
  if (!found || (!found.access && !found.preview)) notFound();

  const { brain, preview } = found;

  // The last two sittings, diffed: what the brain learned between them is
  // the collective-mind claim made visible on the shop floor.
  const examDiff = await query<{ gained: number; lost: number }>(
    `with runs as (
       select id, row_number() over (order by started_at desc) as rn
         from check_runs where brain_id = $1 and status = 'done' and kind = 'full' limit 2
     )
     select count(*) filter (where cur.passed and prev.passed is distinct from true)::int as gained,
            count(*) filter (where not cur.passed and prev.passed)::int as lost
       from check_results cur
       join runs r1 on r1.id = cur.run_id and r1.rn = 1
       left join check_results prev
         on prev.check_id = cur.check_id
        and prev.run_id = (select id from runs where rn = 2)
      where (select count(*) from runs) = 2`,
    [brain.id],
  ).then((r) => r[0] ?? { gained: 0, lost: 0 });

  const [categories, samples, balance, added, children, parent, passedChecks, examTotals] = await Promise.all([
    categoryScores([brain.id]).then((m) => m.get(brain.id) ?? []),
    // Titles are the shop window: enough to judge whether the brain is worth
    // buying, never the bodies that were paid for.
    query<{ title: string; category: string | null }>(
      `select title, category from notes
        where brain_id = $1 and status = 'active'
        order by created_at desc limit ${preview ? 8 : 14}`,
      [brain.id],
    ),
    user
      ? query<{ balance_cents: number }>(
          `select balance_cents from "user" where id = $1`,
          [user.id],
        ).then((r) => r[0]?.balance_cents ?? 0)
      : Promise.resolve(null),
    user ? inLibrary(user.id, brain.id) : Promise.resolve(false),
    brain.parent_id ? Promise.resolve([]) : accessibleChildren(brain.id, user?.id ?? null),
    parentOf(brain),
    // Questions the brain passed on its own latest exam. The strongest thing
    // a storefront can show: not the author's claim, the grader's receipt.
    // Questions only, never the answers — those are what is being sold.
    // Positive checks only: a passed negative probe means "rightly has no
    // answer", which is a strange thing to ask a brain for.
    query<{ question: string; category: string }>(
      `select c.question, c.category
         from check_results r join checks c on c.id = r.check_id
        where r.run_id = (
          select id from check_runs where brain_id = $1 and status = 'done'
          order by started_at desc limit 1
        ) and r.passed and c.kind = 'positive' and c.enabled
        order by c.weight desc, c.category
        limit 8`,
      [brain.id],
    ),
    // The receipt's totals: how much of its own exam the brain passes, and
    // how cleanly it refuses what is out of scope (anti-bluff probes).
    query<{ pos_passed: number; pos_total: number; neg_passed: number; neg_total: number }>(
      `select count(*) filter (where c.kind = 'positive' and r.passed)::int as pos_passed,
              count(*) filter (where c.kind = 'positive')::int as pos_total,
              count(*) filter (where c.kind = 'negative' and r.passed)::int as neg_passed,
              count(*) filter (where c.kind = 'negative')::int as neg_total
         from check_results r join checks c on c.id = r.check_id
        where r.run_id = (
          select id from check_runs where brain_id = $1 and status = 'done'
          order by started_at desc limit 1
        )`,
      [brain.id],
    ).then((r) => r[0] ?? null),
  ]);

  // What actually has to be bought. For a child of a paid family that is the
  // parent — buying the child is not a thing, and offering it without a price
  // would be offering something that does not exist.
  const gate = await gateFor(brain);

  // The report card: which agents taught this brain, and how their notes
  // performed as exam evidence. The strongest version of the collective-mind
  // claim a storefront can make — attribution from the grader, not copy.
  const taught = await agentsTaught([brain.id, ...children.map((c) => c.id)]);

  const [rating, latestReviews, myReview] = await Promise.all([
    query<{ avg: string | null; n: number }>(
      `select round(avg(rating), 1)::text as avg, count(*)::int as n
         from reviews where brain_id = $1`,
      [brain.id],
    ).then((r) => r[0]),
    query<{ rating: number; body: string; handle: string | null; at: string }>(
      `select r.rating, r.body, u.handle,
              to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD') as at
         from reviews r join "user" u on u.id = r.buyer_id
        where r.brain_id = $1 and r.body <> ''
        order by r.created_at desc limit 3`,
      [brain.id],
    ),
    user
      ? query<{ rating: number; body: string }>(
          `select rating, body from reviews where brain_id = $1 and buyer_id = $2`,
          [brain.id, user.id],
        ).then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);

  // Exactly three states, so the page never shows two calls to action or none.
  //   locked  — paid and not bought yet
  //   have    — already in this reader's set, or their own
  //   free    — readable and not added yet
  const owns = brain.owner_id === user?.id;
  const familyAdded = gate ? await inLibrary(user?.id ?? "", gate.brainId) : false;
  const state = preview ? "locked" : owns || added || familyAdded ? "have" : "free";

  const licence = LICENSE[brain.license];

  // Structured data for search engines and AI assistants: a brain is a
  // product with a real price and a real description. Only public facts —
  // no note bodies, no exam internals.
  const jsonLd =
    brain.visibility === "public"
      ? {
          "@context": "https://schema.org",
          "@type": "Product",
          name: brain.title,
          description: brain.goal ?? undefined,
          url: `${env.NEXT_PUBLIC_APP_URL}/b/${handle}/${slug}`,
          brand: { "@type": "Brand", name: "mozg" },
          offers: {
            "@type": "Offer",
            price: ((brain.price_cents ?? 0) / 100).toFixed(2),
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
          },
        }
      : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <TopBar />
      <Contents active="/explore" />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">
          <Link href="/explore">explore</Link> /{" "}
          <Link href={`/explore?topic=${brain.topic}`}>{topicLabel(brain.topic)}</Link> /{" "}
          {handle}
          {parent && (
            <>
              {" / "}
              <Link href={`/b/${handle}/${parent.slug}`}>{parent.title}</Link>
            </>
          )}
        </p>

        <div
          style={{
            display: "flex",
            gap: "1.5rem",
            alignItems: "flex-start",
            flexWrap: "wrap",
            margin: "1rem 0 2.5rem",
          }}
        >
          <span
            aria-hidden
            style={{
              width: 56,
              height: 56,
              border: "1.5px solid var(--ink)",
              background: `var(--color-riso-${tintFor(brain)})`,
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 260 }}>
            <h1 className="h1">
              {brain.title}
            </h1>
            <p style={{ color: "var(--ink-2)", margin: ".6rem 0 0", maxWidth: "60ch" }}>
              {brain.goal ?? "No goal set."}
            </p>
            <p
              className="mono"
              style={{ fontSize: ".75rem", color: "var(--ink-3)", marginTop: ".75rem" }}
            >
              {/* A parent's own count is 0 by design — its children hold the
                  notes, and asking the parent searches all of them, so the
                  storefront states the family's size. */}
              {(brain.note_count + children.reduce((n, c) => n + c.note_count, 0)).toLocaleString()}{" "}
              notes{children.length > 0 ? ` across ${children.length + 1} brains` : ""} · updated{" "}
              {isoDate(brain.updated_at)} ·{" "}
              {brain.score === null ? "not examined" : `trained ${brain.score}%`}
              {rating.n > 0 && ` · ★ ${rating.avg} (${rating.n})`}
            </p>
            {(examDiff.gained > 0 || examDiff.lost > 0) && (
              <p className="mono" style={{ fontSize: ".75rem", marginTop: ".35rem" }}>
                <span style={{ color: "var(--color-riso-green)" }}>
                  since last sitting: +{examDiff.gained} newly passed
                </span>
                {examDiff.lost > 0 && (
                  <span style={{ color: "var(--color-riso-red)" }}> · −{examDiff.lost} lost</span>
                )}
                {" "}— this brain is learning
              </p>
            )}
          </div>
        </div>

        {/* The conversion block, first — Discord feedback was blunt: the way
            in was squeezed at the bottom while a list of exam questions got
            the fold. Terminal wide on the left, add-to-brains beside it. */}
        <div
          style={{
            display: "flex",
            gap: "1.5rem",
            alignItems: "stretch",
            flexWrap: "wrap",
            margin: "0 0 2.5rem",
          }}
        >
          <div style={{ flex: "3 1 340px", minWidth: 0 }}>
            {preview ? (
              <BuyBrain
                handle={handle}
                slug={gate && gate.brainId !== brain.id && parent ? parent.slug : brain.slug}
                priceCents={gate?.priceCents ?? brain.price_cents}
                partOf={gate && gate.brainId !== brain.id ? (parent?.title ?? null) : null}
                balanceCents={balance}
                signedIn={Boolean(user)}
                cryptoReady={anyCryptoReady}
              />
            ) : (
              <section className="term" style={{ fontSize: ".9375rem", height: "100%" }}>
                <div className="term-bar">
                  <span className="term-dot" />
                  <span className="term-dot" />
                  <span className="term-dot" />
                  <span style={{ marginLeft: ".5rem" }}>use this brain</span>
                </div>
                <div className="c">
                  {user ? "# your token from /settings/tokens" : "# sign in to get a token"}
                </div>
                <div style={{ wordBreak: "break-all" }}>
                  <span className="c">$</span> claude mcp add --transport http mozg \
                </div>
                <div style={{ wordBreak: "break-all", paddingLeft: "1.5rem" }}>
                  https://mozg.sh/mcp --header &quot;Authorization: Bearer …&quot;
                </div>
                <div style={{ marginTop: ".9rem" }}>
                  <span className="u">&gt;</span> use {handle}/{brain.slug} — …
                </div>
                <div style={{ display: "flex", gap: ".75rem", alignItems: "center", flexWrap: "wrap" }}>
                  {user ? (
                    <CopyMcpCommand
                      signedIn
                      commandFor={`claude mcp add --transport http mozg ${env.NEXT_PUBLIC_APP_URL}/mcp --header "Authorization: Bearer __TOKEN__"`}
                    />
                  ) : (
                    <Link
                      className="btn"
                      href="/sign-in"
                      style={{
                        marginTop: "1rem",
                        background: "var(--color-riso-yellow)",
                        color: "var(--ink)",
                        borderColor: "var(--color-riso-yellow)",
                      }}
                    >
                      Sign in — get this command with your token in it
                    </Link>
                  )}
                </div>
                {!user && (
                  // For someone landing here from a Discord link with zero
                  // context: one sentence, no jargon, says exactly what
                  // signing in buys them.
                  <p style={{ margin: ".75rem 0 0", color: "#9aa1ab", fontSize: ".8125rem", fontFamily: "inherit" }}>
                    New here? Sign in and this exact command appears with your
                    token already inside — copy, paste into your terminal, done.
                  </p>
                )}
              </section>
            )}
          </div>

          {state === "free" || (state === "have" && !owns) ? (
            <div style={{ flex: "2 1 280px", minWidth: 0 }}>
              <AddBrain
                brainId={brain.id}
                handle={`${handle}/${brain.slug}`}
                signedIn={Boolean(user)}
                added={added || familyAdded}
              />
            </div>
          ) : null}
        </div>

        {(latestReviews.length > 0 || (state === "have" && !owns) || myReview) && (
          <section style={{ margin: "0 0 2.5rem" }}>
            {latestReviews.length > 0 && (
              <>
                <div className="section-head">
                  <h2 className="h2">From buyers</h2>
                  <span className="eyebrow">★ {rating.avg} · {rating.n} rating{rating.n === 1 ? "" : "s"}</span>
                </div>
                <div className="rows" style={{ marginBottom: "1rem" }}>
                  {latestReviews.map((r, i) => (
                    <div key={i} className="row">
                      <span style={{ minWidth: 0 }}>
                        <strong>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</strong>
                        <span className="row-sub">{r.body}</span>
                        <span className="row-meta">{r.handle ?? "buyer"} · {r.at}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {(state === "have" && !owns) && (
              <ReviewBox handle={handle} slug={brain.slug} existing={myReview} />
            )}
          </section>
        )}

        {passedChecks.length > 0 && (
          <section style={{ margin: "0 0 2.5rem" }}>
            <div className="section-head">
              <h2 className="h2">Ask it things like</h2>
              <span className="eyebrow">
                {examTotals && examTotals.pos_total > 0
                  ? `answers ${examTotals.pos_passed}/${examTotals.pos_total} on its latest exam` +
                    (examTotals.neg_total > 0
                      ? ` · anti-bluff ${examTotals.neg_passed}/${examTotals.neg_total}`
                      : "")
                  : "passed on its latest exam — graded, not claimed"}
              </span>
            </div>
            <div className="rows">
              {passedChecks.map((c) => (
                <div key={c.question} className="row">
                  <span style={{ minWidth: 0 }}>
                    <strong>{c.question}</strong>
                    <span className="row-meta">{c.category}</span>
                  </span>
                  <span className="row-side" style={{ color: "var(--color-riso-green)" }}>
                    ✓
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {taught.length > 0 && (
          <section style={{ margin: "0 0 2.5rem" }}>
            <div className="section-head">
              <h2 className="h2">Taught by agents</h2>
              <span className="eyebrow">attribution from the grader, not copy</span>
            </div>
            <div className="rows" style={{ maxWidth: "44rem" }}>
              {taught.map((t) => (
                <div key={t.client} className="row">
                  <span style={{ minWidth: 0 }}>
                    <strong className="mono" style={{ fontSize: ".875rem" }}>{t.client}</strong>
                    <span className="row-sub">
                      {t.notes} note{t.notes === 1 ? "" : "s"} written back while working
                      {t.citedTotal > 0 &&
                        ` · evidence in ${t.citedPass} of ${t.citedTotal} examined answers`}
                    </span>
                  </span>
                  {t.citedTotal > 0 && (
                    <span className="row-side mono" style={{ color: "var(--color-riso-green)" }}>
                      {Math.round((100 * t.citedPass) / t.citedTotal)}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {children.length > 0 && (
          <section style={{ margin: "0 0 2.5rem" }}>
            <div className="section-head">
              <h2 className="h2">What is inside</h2>
              <span className="eyebrow">
                asking this brain searches all {children.length}
              </span>
            </div>
            <div className="rows">
              {children.map((c) => (
                <Link key={c.id} className="row" href={`/b/${handle}/${c.slug}`}>
                  <span style={{ minWidth: 0 }}>
                    <strong>{c.title}</strong>
                    <span className="row-sub">{c.goal ?? "No goal set."}</span>
                    <span className="row-meta">{c.note_count} notes</span>
                  </span>
                  <span className="row-side">
                    {c.score === null ? "—" : `${c.score}%`}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div
          style={{
            display: "grid",
            gap: "1.5rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            alignItems: "start",
          }}
        >
          <section className="scorecard">
            <div className="score-head">
              <div>
                <p className="eyebrow" style={{ marginBottom: ".35rem" }}>
                  What it can answer
                </p>
                <span className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>
                  {categories.length
                    ? `${categories.reduce((n, c) => n + c.total, 0)} checks`
                    : "not examined"}
                </span>
              </div>
              {brain.score !== null && (
                <div className="score-big">
                  {brain.score}
                  <sup>%</sup>
                </div>
              )}
            </div>

            {categories.length === 0 ? (
              <p style={{ padding: "1.25rem", margin: 0, color: "var(--ink-2)" }}>
                This brain has not sat its exam yet, so its coverage is unverified.
              </p>
            ) : (
              categories.map((c) => (
                <div key={c.category} className="score-row" data-state={c.state}>
                  <span className="sig">{STATE_SIGIL[c.state]}</span>
                  <span>{c.category}</span>
                  <span className="count">
                    {c.passed} / {c.total}
                  </span>
                </div>
              ))
            )}

            {brain.visibility === "public" && brain.score !== null && (
              <div style={{ padding: ".9rem 1.25rem", borderTop: "1.5px solid var(--ink)" }}>
                <Link className="navlink" href={`/b/${handle}/${brain.slug}/badge`}>
                  exam badge — share this score →
                </Link>
              </div>
            )}
          </section>
        </div>

        <section style={{ marginTop: "3rem", display: "grid", gap: "2rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <div>
            <h2 className="h2" style={{ marginBottom: "1rem" }}>
              {preview ? "What is inside" : "Inside"}
            </h2>
            {preview && (
              <p style={{ color: "var(--ink-2)", marginTop: 0, fontSize: ".9375rem" }}>
                Note titles, so you can judge before you buy. The contents unlock
                on purchase.
              </p>
            )}
            <ul style={{ margin: 0, paddingLeft: "1.1rem", color: "var(--ink-2)", display: "grid", gap: ".35rem" }}>
              {samples.map((s) => (
                <li key={s.title}>
                  {s.title}
                  {s.category && (
                    <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>
                      {" "}
                      · {s.category}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="h2" style={{ marginBottom: "1rem" }}>
              Licence
            </h2>
            <p className="tag" style={{ display: "inline-block", marginBottom: ".75rem" }}>
              {licence.label}
            </p>
            <p style={{ color: "var(--ink-2)", margin: 0 }}>{licence.detail}</p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
