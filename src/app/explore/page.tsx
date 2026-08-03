import Link from "next/link";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import { query } from "@/db";
import type { Brain } from "@/db/types";
import { categoryScores, tintFor } from "@/lib/brains";
import { currentUser } from "@/lib/session";
import { formatCents } from "@/lib/money-math";
import { TOPICS, topicLabel, isTopic } from "@/lib/topics";

// Reads the database and the session on every request. Without this Next
// prerenders it at build time — which fails in a Docker build (no database)
// and, worse, would serve a cached page that never reflects new public brains.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Explore brains — mozg",
  description:
    "Ready-made knowledge brains, free and paid, you can connect to Claude Code, Codex or Cursor in one command.",
};

interface PublicBrain extends Brain {
  owner_handle: string;
  owner_name: string | null;
}

type Price = "all" | "free" | "paid";
type Sort = "score" | "new" | "popular";

const PRICES: { key: Price; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "free", label: "Free" },
  { key: "paid", label: "Paid" },
];

const SORTS: { key: Sort; label: string; sql: string }[] = [
  { key: "score", label: "Best measured", sql: "b.score desc nulls last, b.updated_at desc" },
  { key: "new", label: "Newest", sql: "b.created_at desc" },
  { key: "popular", label: "Most bought", sql: "b.sales_count desc, b.score desc nulls last" },
];

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ price?: string; sort?: string; topic?: string }>;
}) {
  const params = await searchParams;
  const price = (PRICES.find((p) => p.key === params.price)?.key ?? "all") as Price;
  const sort = SORTS.find((s) => s.key === params.sort) ?? SORTS[0];
  const topic = isTopic(params.topic) ? params.topic : null;

  const user = await currentUser();

  const where =
    price === "free"
      ? "and b.price_cents = 0"
      : price === "paid"
        ? "and b.price_cents > 0"
        : "";

  const brains = await query<PublicBrain>(
    `select b.*, u.handle as owner_handle, u.name as owner_name
       from brains b join "user" u on u.id = b.owner_id
      where b.visibility = 'public' and u.handle is not null ${where}
        and ($1::text is null or b.topic = $1)
      order by ${sort.sql}
      limit 60`,
    [topic],
  );

  // Counts come from the whole catalogue, not the filtered set — a field with
  // nothing in it should say so rather than quietly vanish.
  const perTopic = new Map(
    (
      await query<{ topic: string; n: number }>(
        `select b.topic, count(*)::int as n
           from brains b join "user" u on u.id = b.owner_id
          where b.visibility = 'public' and u.handle is not null
          group by b.topic`,
      )
    ).map((r) => [r.topic, r.n]),
  );

  const href = (over: { price?: Price; sort?: Sort; topic?: string | null }) => {
    const q = new URLSearchParams();
    const p = over.price ?? price;
    const s = over.sort ?? sort.key;
    const t = over.topic === undefined ? topic : over.topic;
    if (p !== "all") q.set("price", p);
    if (s !== "score") q.set("sort", s);
    if (t) q.set("topic", t);
    const qs = q.toString();
    return qs ? `/explore?${qs}` : "/explore";
  };

  const scores = await categoryScores(brains.map((b) => b.id));

  // What the viewer already paid for, so a bought brain never shows a price tag.
  const owned = new Set<string>();
  if (user) {
    const rows = await query<{ brain_id: string }>(
      `select brain_id from purchases where buyer_id = $1`,
      [user.id],
    );
    for (const r of rows) owned.add(r.brain_id);
  }

  return (
    <>
      <TopBar active="explore" />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">Catalogue · connect any of these in one command</p>
        <h1
          className="display"
          style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)", margin: ".4rem 0 1rem" }}
        >
          Brains other people
          <br />
          already built.
        </h1>
        <p style={{ color: "var(--ink-2)", maxWidth: "58ch", marginTop: 0 }}>
          Every one states what it is for and how much of that it can actually
          answer — the score comes from an exam it sat, not from the author&apos;s
          description. Paid brains are bought once from your balance and stay yours.
        </p>

        {/* Filters are links, not state: a filtered catalogue should be a URL
            you can send someone. */}
        <div
          style={{
            display: "flex",
            gap: "1.5rem",
            flexWrap: "wrap",
            alignItems: "center",
            marginTop: "2rem",
            paddingBottom: ".75rem",
            borderBottom: "1.5px solid var(--ink)",
          }}
        >
          <span style={{ display: "flex", gap: ".5rem" }}>
            {PRICES.map((p) => (
              <Link
                key={p.key}
                href={href({ price: p.key })}
                className="tag"
                style={{
                  background: p.key === price ? "var(--ink)" : "transparent",
                  color: p.key === price ? "var(--paper)" : "var(--ink-2)",
                }}
              >
                {p.label}
              </Link>
            ))}
          </span>
          <span style={{ flex: 1 }} />
          <span style={{ display: "flex", gap: ".75rem", alignItems: "center" }}>
            <span className="eyebrow">Sort</span>
            {SORTS.map((s) => (
              <Link
                key={s.key}
                href={href({ sort: s.key })}
                className="mono"
                style={{
                  fontSize: ".75rem",
                  borderBottom: s.key === sort.key ? "2px solid var(--ink)" : "2px solid transparent",
                  color: s.key === sort.key ? "var(--ink)" : "var(--ink-2)",
                  paddingBottom: ".1rem",
                }}
              >
                {s.label}
              </Link>
            ))}
          </span>
        </div>

        {/* Fields, in browsing order. Empty ones stay visible but dimmed —
            "nothing here yet" is a better answer than a missing option. */}
        <div
          style={{
            display: "flex",
            gap: ".4rem",
            flexWrap: "wrap",
            marginTop: "1rem",
            alignItems: "center",
          }}
        >
          <Link
            href={href({ topic: null })}
            className="mono"
            style={{
              fontSize: ".8125rem",
              padding: ".25rem .55rem",
              border: "1.25px solid var(--ink)",
              background: topic === null ? "var(--ink)" : "transparent",
              color: topic === null ? "var(--paper)" : "var(--ink)",
            }}
          >
            All fields
          </Link>
          {TOPICS.map((t) => {
            const n = perTopic.get(t.key) ?? 0;
            const on = topic === t.key;
            return (
              <Link
                key={t.key}
                href={href({ topic: on ? null : t.key })}
                className="mono"
                title={t.blurb}
                style={{
                  fontSize: ".8125rem",
                  padding: ".25rem .55rem",
                  border: "1.25px solid var(--rule)",
                  borderColor: on ? "var(--ink)" : "var(--rule)",
                  background: on ? "var(--ink)" : "transparent",
                  color: on ? "var(--paper)" : n ? "var(--ink-2)" : "var(--ink-3)",
                }}
              >
                {t.label}
                {n > 0 && <span style={{ opacity: 0.6 }}> {n}</span>}
              </Link>
            );
          })}
        </div>

        {topic && (
          <p style={{ color: "var(--ink-2)", marginTop: "1rem", marginBottom: 0 }}>
            {TOPICS.find((t) => t.key === topic)?.blurb}
          </p>
        )}

        {brains.length === 0 ? (
          <div className="panel" style={{ marginTop: "2rem", maxWidth: "58ch" }}>
            <p className="eyebrow">
              {topic
                ? `Nothing in ${topicLabel(topic)} yet`
                : price === "all"
                  ? "Nothing public yet"
                  : `No ${price} brains yet`}
            </p>
            <h2 className="display" style={{ fontSize: "1.5rem", margin: ".5rem 0 .75rem" }}>
              {topic || price !== "all" ? "Try the whole catalogue." : "Be the first."}
            </h2>
            <p style={{ color: "var(--ink-2)", marginTop: 0 }}>
              Publishing a brain makes it readable by anyone and gives it a page
              search engines can find. Set a price and it earns every time someone
              buys it.
            </p>
            <div style={{ display: "flex", gap: ".75rem", marginTop: "1rem", flexWrap: "wrap" }}>
              <Link className="btn" href="/brains">
                Go to your brains
              </Link>
              {(topic || price !== "all") && (
                <Link className="btn btn-ghost" href="/explore">
                  Show everything
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="grid-brains" style={{ marginTop: "2rem" }}>
            {brains.map((brain) => (
              <Link
                key={brain.id}
                href={`/b/${brain.owner_handle}/${brain.slug}`}
                className="card"
                data-tint={tintFor(brain)}
              >
                <span
                  className="eyebrow"
                  style={{
                    color: "inherit",
                    opacity: 0.75,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: ".5rem",
                  }}
                >
                  <span>
                    {topicLabel(brain.topic)} · {brain.owner_handle}
                  </span>
                  <PriceTag brain={brain} owned={owned.has(brain.id)} />
                </span>

                <h2 className="card-title">{brain.title}</h2>
                <p className="card-goal">{brain.goal ?? "No goal set."}</p>

                <div className="readout">
                  {(scores.get(brain.id) ?? Array.from({ length: 6 }, () => ({ state: "empty" as const }))).map(
                    (c, i) => (
                      <span key={i} className="readout-cell" data-state={c.state} />
                    ),
                  )}
                </div>

                <div className="card-foot">
                  <span style={{ opacity: 0.8 }}>
                    {brain.note_count} notes
                    {brain.sales_count > 0 && ` · ${brain.sales_count} sold`}
                  </span>
                  {brain.score !== null && (
                    <span className="card-score">
                      {brain.score}
                      <sup>%</sup>
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}

        <section
          className="panel"
          style={{ marginTop: "3rem", display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "center" }}
        >
          <div style={{ flex: "1 1 30ch" }}>
            <h2 className="display" style={{ fontSize: "1.375rem", margin: 0 }}>
              Sell what you already know.
            </h2>
            <p style={{ color: "var(--ink-2)", margin: ".5rem 0 0" }}>
              Publish a brain, set a price, keep 70% of every sale. Buyers get read
              access through their agent — the licence forbids reselling it.
            </p>
          </div>
          <Link className="btn" href="/guide">
            How to build one
          </Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function PriceTag({ brain, owned }: { brain: Brain; owned: boolean }) {
  if (owned) return <span style={{ fontWeight: 700 }}>Owned</span>;
  if (brain.price_cents === 0) return <span>Free</span>;
  return <span style={{ fontWeight: 700 }}>{formatCents(brain.price_cents)}</span>;
}
