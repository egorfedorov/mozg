import Link from "next/link";
import { markup } from "@/lib/markup";
import { translator } from "@/lib/t";
import { msg } from "@/lib/msg";
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
import { publicWorkflows } from "@/lib/workflow-store";

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
  { key: "all", label: msg("Everything") },
  { key: "free", label: msg("Free") },
  { key: "paid", label: msg("Paid") },
];

/** Brains per page. Two dozen fills a screen without asking for a scroll. */
const PER_PAGE = 24;

/** Routes get their own ink so a card is never mistaken for a brain. */
const ROUTE_TINTS = ["violet", "orange", "green"] as const;

/** "read 3d ago" — short enough for a card foot, exact enough to matter. */
function freshness(when: Date, t: (s: string) => string): string {
  const days = Math.floor((Date.now() - new Date(when).getTime()) / 86_400_000);
  if (days <= 0) return t("today");
  if (days === 1) return t("yesterday");
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const SORTS: { key: Sort; label: string; sql: string }[] = [
  { key: "score", label: msg("Best measured"), sql: "b.score desc nulls last, b.updated_at desc" },
  { key: "new", label: msg("Newest"), sql: "b.created_at desc" },
  { key: "popular", label: msg("Most bought"), sql: "b.sales_count desc, b.score desc nulls last" },
];

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ price?: string; sort?: string; topic?: string; page?: string }>;
}) {
  const t = await translator();

  const params = await searchParams;
  const price = (PRICES.find((p) => p.key === params.price)?.key ?? "all") as Price;
  const sort = SORTS.find((s) => s.key === params.sort) ?? SORTS[0];
  const topic = isTopic(params.topic) ? params.topic : null;
  // Pages, not one endless column. A catalogue that grows past a screenful of
  // scrolling stops reading as a shelf and starts reading as a dump, and the
  // brains at the bottom are never seen — which is the ones published last.
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

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
  const brains = await query<
    PublicBrain & { calls_week: number; readers_week: number; last_read: Date | null }
  >(
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
            -- Freshness: when this family last read a source. A score says
            -- how well the material answers its goal and nothing about
            -- whether the material is current, and "read yesterday" is the
            -- other half of why you would trust a brain.
            (select max(s.processed_at) from sources s
              where s.brain_id = b.id
                 or s.brain_id in (select id from brains c4 where c4.parent_id = b.id)) as last_read,
            (select count(distinct k.caller_id)::int from calls k
              where k.created_at > now() - interval '7 days'
                and (k.brain_id = b.id or k.brain_id in
                     (select id from brains c3 where c3.parent_id = b.id))) as readers_week
       from brains b join "user" u on u.id = b.owner_id
      where b.visibility = 'public' and u.handle is not null
        and b.parent_id is null ${where}
        -- Never list a shelf with nothing on it. The publish gate stops new
        -- ones; this covers whatever was published before it existed, and any
        -- brain whose notes were deleted afterwards.
        and (b.note_count > 0
             or exists (select 1 from brains c
                         where c.parent_id = b.id and c.note_count > 0))
        and ($1::text is null or b.topic = $1)
      order by ${sort.sql}
      limit ${PER_PAGE + 1} offset ${(page - 1) * PER_PAGE}`,
    [topic],
  );

  // One row past the page tells us whether a next page exists without a
  // second count(*) over the same filters.
  const hasNext = brains.length > PER_PAGE;
  if (hasNext) brains.pop();

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

  const href = (over: { price?: Price; sort?: Sort; topic?: string | null; page?: number }) => {
    const q = new URLSearchParams();
    const p = over.price ?? price;
    const s = over.sort ?? sort.key;
    const t = over.topic === undefined ? topic : over.topic;
    // Changing a filter goes back to page one: page 3 of the old filter is
    // almost never page 3 of the new one, and landing on an empty page reads
    // as "nothing here" rather than "you were on page 3".
    const n = over.page ?? (over.price || over.sort || over.topic !== undefined ? 1 : page);
    if (p !== "all") q.set("price", p);
    if (s !== "score") q.set("sort", s);
    if (t) q.set("topic", t);
    if (n > 1) q.set("page", String(n));
    const qs = q.toString();
    return qs ? `/explore?${qs}` : "/explore";
  };

  const scores = await categoryScores(brains.map((b) => b.id));

  // Routes ride along with the shelf: the person browsing brains is the one
  // who wants to know what order they go in.
  const routes = page === 1 ? await publicWorkflows(8) : [];

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
          {markup(t("Brains other people <0/> already built."), [
          <br key="s0" />,
        ])}</h1>
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
                {t(p.label)}
              </Chip>
            ))}
            <span style={{ flex: 1 }} />
            <span className="eyebrow">{t("Sort")}</span>
            {SORTS.map((s) => (
              <Chip key={s.key} href={href({ sort: s.key })} on={s.key === sort.key}>
                {t(s.label)}
              </Chip>
            ))}
          </div>

          {/* Fields, in browsing order. Empty ones stay visible but dimmed —
              "nothing here yet" is a better answer than a missing option. */}
          <div className="chips">
            <Chip href={href({ topic: null })} on={topic === null}>
              {t("All fields")}</Chip>
            {/* `field`, not `t`: the parameter used to shadow the translator,
                which is invisible until something inside asks it to translate. */}
            {TOPICS.map((field) => (
              <Chip
                key={field.key}
                href={href({ topic: topic === field.key ? null : field.key })}
                on={topic === field.key}
                count={perTopic.get(field.key) ?? 0}
                title={t(field.blurb)}
              >
                {t(field.label)}
              </Chip>
            ))}
          </div>

          {topic && (
            <p className="lede">
              {t(TOPICS.find((f) => f.key === topic)?.blurb ?? "")}
            </p>
          )}
        </div>

        {brains.length === 0 ? (
          <div className="panel" style={{ marginTop: "2rem", maxWidth: "58ch" }}>
            <p className="eyebrow">
              {topic
                ? markup(t("Nothing in <0/> yet"), [topicLabel(topic)])
                : price === "all"
                  ? t("Nothing public yet")
                  : markup(t("No <0/> brains yet"), [price])}
            </p>
            <h2 className="h2" style={{ margin: ".5rem 0 .75rem" }}>
              {topic || price !== "all" ? t("Try the whole catalogue.") : t("Be the first.")}
            </h2>
            <p style={{ color: "var(--ink-2)", marginTop: 0 }}>
              {t("Publishing a brain makes it readable by anyone and gives it a page search engines can find. Set a price and it earns every time someone buys it.")}</p>
            <div style={{ display: "flex", gap: ".75rem", marginTop: "1rem", flexWrap: "wrap" }}>
              <Link className="btn" href="/brains">
                {t("Go to your brains")}</Link>
              {(topic || price !== "all") && (
                <Link className="btn btn-ghost" href="/explore">
                  {t("Show everything")}</Link>
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
                  <PriceTag brain={brain} owned={owned.has(brain.id)} t={t} />
                </span>

                <h2 className="card-title">{brain.title}</h2>
                <p className="card-goal">{brain.goal ?? t("No goal set.")}</p>

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
                    {markup(t("<0/> notes <1/> <2/> <3/> <4/>"), [
                    (brain.note_count + brain.child_notes).toLocaleString(),
                    brain.children > 0 && ` · ${brain.children} inside`,
                    brain.price_cents > 0 && brain.sales_count > 0 && ` · ${brain.sales_count} sold`,
                    brain.calls_week > 0 && ` · ${brain.calls_week} asks/wk`,
                    brain.readers_week > 1 && ` · ${brain.readers_week} people`,
                    brain.last_read && ` · read ${freshness(brain.last_read, t)}`,
                  ])}</span>
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

        {(page > 1 || hasNext) && (
          <nav
            className="chips"
            style={{ marginTop: "1.5rem", alignItems: "center" }}
            aria-label={t("Pages")}
          >
            {page > 1 && <Chip href={href({ page: page - 1 })}>{t("Previous")}</Chip>}
            {/* Numbered, because "next" alone hides how much there is. Pages
                past the last one are unknowable without a count over the whole
                filter, so the run stops at the first page we know exists. */}
            {Array.from({ length: page + (hasNext ? 1 : 0) }, (_, i) => i + 1).map((n) => (
              <Chip key={n} href={href({ page: n })} on={n === page}>
                {String(n)}
              </Chip>
            ))}
            {hasNext && <Chip href={href({ page: page + 1 })}>{t("Next")}</Chip>}
          </nav>
        )}

        {routes.length > 0 && (
          <section style={{ marginTop: "3.5rem" }}>
            {/* Routes live in the catalogue, not on a page of their own: the
                person browsing brains is the person who wants the order they
                go in, and asking them to find a second page for it is asking
                them to know the product first. Same card language as the
                brains — a route is a thing you take off the shelf too. */}
            <p className="eyebrow">{t("Workflows · the order the brains are read in")}</p>
            <h2 className="h1" style={{ margin: ".4rem 0 .6rem", fontSize: "clamp(1.5rem, 4vw, 2.2rem)" }}>
              {t("Whole jobs, not single answers.")}
            </h2>
            <p style={{ color: "var(--ink-2)", maxWidth: "58ch", marginTop: 0 }}>
              {t("A route names the brain each step reads, the prompt, the rules and the check that ends it. Your agent walks it — nothing runs on our side.")}
            </p>

            <div className="grid-brains" style={{ marginTop: "1.5rem" }}>
              {routes.map((w, i) => {
                const brains = new Set(w.steps.map((s) => s.brain).filter(Boolean));
                const checks = w.steps.filter((s) => s.done_when).length;
                return (
                  <Link
                    key={w.id}
                    href={w.handle ? `/w/${w.handle}/${w.slug}` : "/build"}
                    className="card"
                    data-tint={ROUTE_TINTS[i % ROUTE_TINTS.length]}
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
                      <span>{t("Workflow")} · {w.handle}</span>
                      <span>{t("Free")}</span>
                    </span>

                    <h3 className="card-title">{w.title}</h3>
                    <p className="card-goal">{w.summary ?? ""}</p>

                    {/* One cell per step, filled where the step ends in a
                        check — the same readout grammar the brains use for
                        exam categories, so the shelf reads as one thing. */}
                    <div
                      className="readout"
                      role="img"
                      aria-label={`${w.steps.length} steps, ${checks} with a check`}
                    >
                      {w.steps.slice(0, 12).map((s, n) => (
                        <span
                          key={n}
                          className="readout-cell"
                          data-state={s.done_when ? "pass" : "empty"}
                        />
                      ))}
                    </div>

                    <div className="card-foot">
                      <span style={{ opacity: 0.8 }}>
                        {w.steps.length} {t("steps")} · {brains.size} {t("brains")}
                      </span>
                      <span className="card-score">
                        {checks}
                        <sup>✓</sup>
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>

            <p style={{ marginTop: "1rem" }}>
              <Link href="/build" className="mono" style={{ fontSize: ".8125rem" }}>
                {t("How a workflow is built →")}
              </Link>
            </p>
          </section>
        )}

        <section
          className="panel"
          style={{ marginTop: "3rem", display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "center" }}
        >
          <div style={{ flex: "1 1 30ch" }}>
            <h2 className="h2">
              {t("Sell what you already know.")}</h2>
            <p style={{ color: "var(--ink-2)", margin: ".5rem 0 0" }}>
              {markup(t("Publish a brain, set a price, keep <0/>% of every sale. Buyers get read access through their agent — the licence forbids reselling it. And if the brain you need is missing: <1>name it</1> — good requests get built within days."), [
              100 - PLATFORM_FEE_PERCENT,
              <a href="/chat" key="s1" />,
            ])}</p>
          </div>
          <Link className="btn" href="/guide">
            {t("How to build one")}</Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function PriceTag({
  brain,
  owned,
  t,
}: {
  brain: Brain;
  owned: boolean;
  // Handed down rather than awaited here: a helper beside the page is a plain
  // synchronous function and has no translator of its own.
  t: (english: string) => string;
}) {
  if (owned) return <span style={{ fontWeight: 700 }}>{t("Owned")}</span>;
  if (brain.price_cents === 0) return <span>{t("Free")}</span>;
  return <span style={{ fontWeight: 700 }}>{formatCents(brain.price_cents)}</span>;
}
