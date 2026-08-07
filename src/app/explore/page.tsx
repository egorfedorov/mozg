import Link from "next/link";
import { translator } from "@/lib/t";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import { query } from "@/db";
import type { Brain } from "@/db/types";
import { categoryScores, tintFor } from "@/lib/brains";
import { currentUser } from "@/lib/session";
import { formatCents, PLATFORM_FEE_PERCENT } from "@/lib/money-math";
import { TOPICS, topicLabel, isTopic } from "@/lib/topics";
import { Chip } from "@/components/ui";

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
  children: number;
  child_notes: number;
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
  const t = await translator();

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

  // Families are one entry, not eight. A parent already covers its children
  // when searched, so listing each child beside it fills the catalogue with
  // rows that are the same purchase and the same connection.
  const brains = await query<PublicBrain & { calls_week: number; readers_week: number }>(
    `select b.*, u.handle as owner_handle, u.name as owner_name,
            (select count(*)::int from brains c
              where c.parent_id = b.id and c.visibility = 'public') as children,
            (select coalesce(sum(c.note_count), 0)::int from brains c
              where c.parent_id = b.id and c.visibility = 'public') as child_notes,
            -- Social proof from the metering table, family-wide: agents ask
            -- the parent, so a child-only count would undercount every family.
            (select count(*)::int from calls k
              where k.created_at > now() - interval '7 days'
                and (k.brain_id = b.id or k.brain_id in
                     (select id from brains c2 where c2.parent_id = b.id))) as calls_week,
            -- How many *people*, not how many calls. One agent in a loop can
            -- make a brain look busy; two readers cannot be faked by one caller,
            -- and "asked by four people this week" is the sentence that means
            -- something to somebody deciding whether to connect it.
            (select count(distinct k.caller_id)::int from calls k
              where k.created_at > now() - interval '7 days'
                and (k.brain_id = b.id or k.brain_id in
                     (select id from brains c3 where c3.parent_id = b.id))) as readers_week
       from brains b join "user" u on u.id = b.owner_id
      where b.visibility = 'public' and u.handle is not null
        and b.parent_id is null ${where}
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
            and b.parent_id is null
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
      <TopBar />
      <Contents active="/explore" />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">{t("Catalogue · connect any of these in one command")}</p>
        <h1 className="h1" style={{ margin: ".4rem 0 1rem" }}>
          Brains other people
          <br />
          already built.
        </h1>
        <p style={{ color: "var(--ink-2)", maxWidth: "58ch", marginTop: 0 }}>
          {t("Every one states what it is for and how much of that it can actually answer — the score comes from an exam it sat, not from the author's description. Paid brains are bought once from your balance and stay yours.")}</p>

        {/* One filter language: chips. This row used to carry three. */}
        <div className="stack-tight" style={{ marginTop: "2rem" }}>
          <div
            className="chips"
            style={{ paddingBottom: ".75rem", borderBottom: "1.5px solid var(--ink)" }}
          >
            {PRICES.map((p) => (
              <Chip key={p.key} href={href({ price: p.key })} on={p.key === price}>
                {p.label}
              </Chip>
            ))}
            <span style={{ flex: 1 }} />
            <span className="eyebrow">Sort</span>
            {SORTS.map((s) => (
              <Chip key={s.key} href={href({ sort: s.key })} on={s.key === sort.key}>
                {s.label}
              </Chip>
            ))}
          </div>

          {/* Fields, in browsing order. Empty ones stay visible but dimmed —
              "nothing here yet" is a better answer than a missing option. */}
          <div className="chips">
            <Chip href={href({ topic: null })} on={topic === null}>
              {t("All fields")}</Chip>
            {TOPICS.map((t) => (
              <Chip
                key={t.key}
                href={href({ topic: topic === t.key ? null : t.key })}
                on={topic === t.key}
                count={perTopic.get(t.key) ?? 0}
                title={t.blurb}
              >
                {t.label}
              </Chip>
            ))}
          </div>

          {topic && <p className="lede">{TOPICS.find((t) => t.key === topic)?.blurb}</p>}
        </div>

        {brains.length === 0 ? (
          <div className="panel" style={{ marginTop: "2rem", maxWidth: "58ch" }}>
            <p className="eyebrow">
              {topic
                ? `Nothing in ${topicLabel(topic)} yet`
                : price === "all"
                  ? "Nothing public yet"
                  : `No ${price} brains yet`}
            </p>
            <h2 className="h2" style={{ margin: ".5rem 0 .75rem" }}>
              {topic || price !== "all" ? "Try the whole catalogue." : "Be the first."}
            </h2>
            <p style={{ color: "var(--ink-2)", marginTop: 0 }}>
              {t("Publishing a brain makes it readable by anyone and gives it a page search engines can find. Set a price and it earns every time someone buys it.")}</p>
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

                <div
                  className="readout"
                  role="img"
                  aria-label={
                    scores.get(brain.id)?.length
                      ? scores
                          .get(brain.id)!
                          .map((c) => `${c.category}: ${c.passed} of ${c.total}`)
                          .join(", ")
                      : "Not examined yet"
                  }
                >
                  {(scores.get(brain.id) ?? Array.from({ length: 6 }, () => ({ state: "empty" as const }))).map(
                    (c, i) => (
                      <span key={i} className="readout-cell" data-state={c.state} />
                    ),
                  )}
                </div>

                <div className="card-foot">
                  <span style={{ opacity: 0.8 }}>
                    {(brain.note_count + brain.child_notes).toLocaleString()} notes
                    {brain.children > 0 && ` · ${brain.children} inside`}
                    {/* Only a brain that is actually for sale can have been sold.
                        On a free one the line read as a shop counter at zero. */}
                    {brain.price_cents > 0 && brain.sales_count > 0 && ` · ${brain.sales_count} sold`}
                    {brain.calls_week > 0 && ` · ${brain.calls_week} asks/wk`}
                    {/* Two, not one: "asked by 1 person" is the author, and saying
                        so out loud makes a young brain look abandoned rather than
                        new. */}
                    {brain.readers_week > 1 && ` · ${brain.readers_week} people`}
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
            <h2 className="h2">
              {t("Sell what you already know.")}</h2>
            <p style={{ color: "var(--ink-2)", margin: ".5rem 0 0" }}>
              Publish a brain, set a price, keep {100 - PLATFORM_FEE_PERCENT}% of
              every sale. Buyers get read access through their agent — the licence
              forbids reselling it. And if the brain you need is missing:{" "}
              <a href="/chat">
                name it
              </a>{" "}
              — good requests get built within days.
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
