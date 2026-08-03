import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import TopBar from "@/components/TopBar";
import BuyBrain from "@/components/BuyBrain";
import { query } from "@/db";
import { accessForSlug } from "@/lib/access";
import { categoryScores, tintFor } from "@/lib/brains";
import { currentUser } from "@/lib/session";
import { topicLabel } from "@/lib/topics";

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

/**
 * Not toLocaleDateString: it renders differently on the server and in the
 * browser (a hydration mismatch), and "8/3/2026" is ambiguous to half the
 * planet. ISO is identical everywhere and reads the same in every locale.
 */
function isoDate(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}): Promise<Metadata> {
  const { handle, slug } = await params;
  const found = await accessForSlug(handle, slug, null);
  if (!found?.brain || found.brain.visibility !== "public") return { title: "mozg" };
  return {
    title: `${found.brain.title} — a mozg brain`,
    description: found.brain.goal ?? undefined,
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

  const [categories, samples, balance] = await Promise.all([
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
  ]);

  const licence = LICENSE[brain.license];

  return (
    <>
      <TopBar />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">
          <Link href="/explore">explore</Link> /{" "}
          <Link href={`/explore?topic=${brain.topic}`}>{topicLabel(brain.topic)}</Link> /{" "}
          {handle}
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
            <h1 className="display" style={{ fontSize: "clamp(2rem, 5vw, 3rem)" }}>
              {brain.title}
            </h1>
            <p style={{ color: "var(--ink-2)", margin: ".6rem 0 0", maxWidth: "60ch" }}>
              {brain.goal ?? "No goal set."}
            </p>
            <p
              className="mono"
              style={{ fontSize: ".75rem", color: "var(--ink-3)", marginTop: ".75rem" }}
            >
              {brain.note_count} notes · updated {isoDate(brain.updated_at)} ·{" "}
              {brain.score === null ? "not examined" : `trained ${brain.score}%`}
            </p>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: "1.5rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            alignItems: "start",
          }}
        >
          {preview ? (
            <BuyBrain
              handle={handle}
              slug={brain.slug}
              priceCents={brain.price_cents}
              balanceCents={balance}
              signedIn={Boolean(user)}
            />
          ) : (
          <section className="term">
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
            {!user && (
              <Link
                className="btn"
                href="/sign-in"
                style={{
                  marginTop: "1.1rem",
                  background: "var(--color-riso-yellow)",
                  color: "var(--ink)",
                  borderColor: "var(--color-riso-yellow)",
                }}
              >
                Get a token
              </Link>
            )}
          </section>
          )}

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
          </section>
        </div>

        <section style={{ marginTop: "3rem", display: "grid", gap: "2rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <div>
            <h2 className="display" style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
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
            <h2 className="display" style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
              Licence
            </h2>
            <p className="tag" style={{ display: "inline-block", marginBottom: ".75rem" }}>
              {licence.label}
            </p>
            <p style={{ color: "var(--ink-2)", margin: 0 }}>{licence.detail}</p>
          </div>
        </section>
      </main>
    </>
  );
}
