import Link from "next/link";
import { markup } from "@/lib/markup";
import { translator } from "@/lib/t";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import { query, maybeOne } from "@/db";
import { currentUser } from "@/lib/session";
import { tintFor } from "@/lib/brains";
import { topicLabel } from "@/lib/topics";
import { CATALOG, globalAchievements, syncAchievements, userStats } from "@/lib/achievements";
import { Stats, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * A person's page: what they published, what they are studying, what they have
 * earned.
 *
 * Two audiences, one URL. A stranger sees what is already public — the brains
 * this person published, the badges they earned, and how much studying those
 * badges stand for. The owner sees their own shelf on top: every brain their
 * agents can reach, including private ones, and every course in flight.
 *
 * That split is deliberate and not adjustable. A shelf is a reading history,
 * and a reading history says more about someone than they meant to publish —
 * so the counts are public and the titles are not, unless the person put them
 * in the catalogue themselves.
 */

async function profileFor(handle: string) {
  return maybeOne<{ id: string; handle: string; name: string | null; joined: string }>(
    `select id, handle, name,
            to_char("createdAt" at time zone 'UTC', 'YYYY-MM-DD') as joined
       from "user" where handle = $1`,
    [handle],
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const who = await profileFor(handle);
  if (!who) return { title: "mozg" };
  const title = `${who.handle} — brains on mozg`;
  return {
    title,
    description: `Brains published by ${who.handle}, what they have studied, and the badges they earned.`,
    openGraph: { title, type: "profile", url: `/b/${handle}` },
  };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const t = await translator();

  const { handle } = await params;
  const who = await profileFor(handle);
  if (!who) notFound();

  const viewer = await currentUser();
  const isMe = viewer?.id === who.id;

  // Rendering your own page is the sync, same as the trophy shelf: a crossing
  // recorded on view needs no separate write path.
  const stats = isMe ? await syncAchievements(who.id) : await userStats(who.id);
  const earned = await globalAchievements(who.id);

  const published = await query<{
    id: string;
    slug: string;
    title: string;
    goal: string | null;
    score: number | null;
    note_count: number;
    color: string;
    topic: string;
    price_cents: number;
  }>(
    `select b.id, b.slug, b.title, b.goal, b.score, b.note_count, b.color, b.topic,
            b.price_cents
       from brains b
      where b.owner_id = $1 and b.visibility = 'public'
      order by b.score desc nulls last, b.note_count desc
      limit 60`,
    [who.id],
  );

  // The owner's own shelf: everything their agents can reach, however it got
  // there. Never queried for a stranger — not filtered afterwards, not fetched
  // at all.
  const shelf = isMe
    ? await query<{
        id: string;
        slug: string;
        title: string;
        owner_handle: string | null;
        score: number | null;
        color: string;
        access: string;
        cards: number;
        learned: number;
      }>(
        `with mine as (
           select b.id, b.slug, b.title, b.score, b.color, u.handle as owner_handle,
                  case when b.owner_id = $1 then 'own'
                       when exists (select 1 from purchases p
                                     where p.brain_id = b.id and p.buyer_id = $1) then 'bought'
                       else 'added' end as access
             from brains b join "user" u on u.id = b.owner_id
            where b.owner_id = $1
               or b.id in (select brain_id from library where user_id = $1)
               or b.id in (select brain_id from purchases where buyer_id = $1)
         )
         select m.*,
                (select count(*) from notes n where n.brain_id = m.id and n.status = 'active')::int
                + (select count(*) from checks c where c.brain_id = m.id and c.enabled)::int as cards,
                (select count(*) from learn_progress p
                  where p.user_id = $1 and p.brain_id = m.id and p.reps > 0)::int as learned
           from mine m
          order by learned desc, m.score desc nulls last
          limit 60`,
        [who.id],
      )
    : [];

  // The other half of the contribution loop. Someone whose agent proposed a
  // note to a brain they only read has no other way to learn what became of
  // it, and a contribution with no visible outcome is one nobody repeats.
  const proposals = isMe
    ? await query<{
        title: string;
        status: string;
        at: string;
        brain_title: string;
        owner_handle: string | null;
        slug: string;
      }>(
        `select n.title, n.status,
                to_char(n.created_at at time zone 'UTC', 'YYYY-MM-DD') as at,
                b.title as brain_title, u.handle as owner_handle, b.slug
           from notes n
           join brains b on b.id = n.brain_id
           join "user" u on u.id = b.owner_id
          where n.proposed_by = $1
          order by n.created_at desc limit 25`,
        [who.id],
      )
    : [];

  const studying = shelf.filter((b) => b.learned > 0);
  const done = CATALOG.filter((a) => earned.has(a.kind));

  return (
    <>
      <TopBar />
      <Contents />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">{isMe ? t("Your public page") : t("Person")}</p>
        <h1
          className="display"
          style={{ fontSize: "clamp(2rem, 5.5vw, 3.4rem)", margin: ".4rem 0 .5rem" }}
        >
          {who.handle}
        </h1>
        <p className="lede" style={{ maxWidth: "56ch", marginTop: 0 }}>
          {markup(t("<0/>on mozg since <1/>. <2/>"), [
          who.name ? `${who.name} · ` : "",
          who.joined,
          published.length > 0
            ? `${published.length} brain${published.length === 1 ? "" : "s"} in the catalogue.`
            : t("Nothing published yet."),
        ])}</p>

        <Stats>
          <Stat label={t("Published")} value={String(stats.public_brains)} note={t("in the catalogue")} />
          {/* A stranger gets the published total only. The all-brains figure
              would put the size of someone's private shelf on a public page. */}
          <Stat
            label={t("Notes")}
            value={(isMe
              ? stats.notes
              : published.reduce((n, b) => n + b.note_count, 0)
            ).toLocaleString()}
            note={isMe ? "across all your brains" : "in their published brains"}
          />
          <Stat label={t("Badges")} value={`${done.length} / ${CATALOG.length}`} href={isMe ? "/achievements" : undefined} />
          <Stat label={t("Duels won")} value={String(stats.duels)} note={t("outscored a brain's own exam")} />
          <Stat label={t("Best streak")} value={`${stats.best_streak}d`} note={t("studying, in a row")} />
          {stats.best_score > 0 && (
            <Stat label={t("Best exam")} value={`${stats.best_score}%`} note={t("their strongest brain")} />
          )}
        </Stats>

        {published.length > 0 && (
          <section style={{ marginTop: "2.5rem" }}>
            <div className="section-head">
              <h2 className="h2">{t("Published brains")}</h2>
              <span className="eyebrow">{t("anyone can add these")}</span>
            </div>
            <div className="grid-brains">
              {published.map((b) => (
                <Link
                  key={b.id}
                  href={`/b/${who.handle}/${b.slug}`}
                  className="card"
                  data-tint={tintFor(b)}
                >
                  <span className="eyebrow" style={{ color: "inherit", opacity: 0.75 }}>
                    {topicLabel(b.topic)}
                    {b.price_cents > 0 ? t(" · paid") : t(" · free")}
                  </span>
                  <h3 className="card-title">{b.title}</h3>
                  <p className="card-goal">{b.goal?.split("\n")[0] ?? t("No goal set.")}</p>
                  <p
                    className="mono"
                    style={{ fontSize: ".75rem", marginTop: "auto", marginBottom: 0, opacity: 0.9 }}
                  >
                    {markup(t("<0/> notes <1/>"), [
                    b.note_count,
                    b.score != null ? ` · exam ${b.score}%` : t(" · unexamined"),
                  ])}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {isMe && (
          <>
            <section style={{ marginTop: "2.5rem" }}>
              <div className="section-head">
                <h2 className="h2">{t("Connected to your agents")}</h2>
                <span className="eyebrow">{t("only you can see this list")}</span>
              </div>
              <div className="rows" style={{ maxWidth: "52rem" }}>
                {shelf.length === 0 ? (
                  <p className="row-empty">
                    {markup(t("Nothing on the shelf yet — take one from the <0>catalogue</0> ."), [
                    <Link href="/explore" style={{ textDecoration: "underline" }} key="s0" />,
                  ])}</p>
                ) : (
                  shelf.map((b) => (
                    <Link
                      key={b.id}
                      className="row"
                      href={
                        b.access === "own"
                          ? `/brains/${b.slug}`
                          : `/b/${b.owner_handle}/${b.slug}`
                      }
                    >
                      <span style={{ minWidth: 0 }}>
                        <strong>{b.title}</strong>
                        <span className="row-sub">
                          {b.access === "own"
                            ? t("yours")
                            : markup(t("<0/> from <1/>"), [b.access, b.owner_handle])}
                          {b.score != null && markup(t(" · exam <0/>%"), [b.score])}
                        </span>
                        <span className="row-meta">
                          {markup(t("<0/> cards <1/>"), [
                          b.cards,
                          b.learned > 0
                            ? ` · you have studied ${Math.round((Math.min(b.learned, b.cards) / Math.max(b.cards, 1)) * 100)}%`
                            : t(" · not studied yet"),
                        ])}</span>
                      </span>
                      <span className="row-side mono" style={{ fontSize: ".75rem" }}>
                        {b.access}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </section>

            {proposals.length > 0 && (
              <section style={{ marginTop: "2.5rem" }}>
                <div className="section-head">
                  <h2 className="h2">{t("Notes you proposed")}</h2>
                  <span className="eyebrow">
                    {markup(t("<0/> taken · <1/> waiting"), [
                    proposals.filter((p) => p.status === "active").length,
                    proposals.filter((p) => p.status === "pending").length,
                  ])}</span>
                </div>
                <p style={{ color: "var(--ink-2)", marginTop: 0, maxWidth: "62ch" }}>
                  {t("Your agent learned these while reading someone else's brain and sent them to its owner. They answer nobody until the owner takes them.")}</p>
                <div className="rows" style={{ maxWidth: "52rem" }}>
                  {proposals.map((p, i) => (
                    <Link
                      key={i}
                      className="row"
                      href={`/b/${p.owner_handle}/${p.slug}`}
                      data-tint={
                        p.status === "active"
                          ? "green"
                          : p.status === "rejected"
                            ? "red"
                            : undefined
                      }
                    >
                      <span style={{ minWidth: 0 }}>
                        <strong>{p.title}</strong>
                        <span className="row-meta">
                          {markup(t("to <0/>/<1/> · <2/>"), [
                          p.owner_handle,
                          p.slug,
                          p.at,
                        ])}</span>
                      </span>
                      <span className="row-side mono" style={{ fontSize: ".75rem" }}>
                        {p.status === "active"
                          ? "taken"
                          : p.status === "pending"
                            ? "waiting"
                            : p.status}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {studying.length > 0 && (
              <section style={{ marginTop: "2.5rem" }}>
                <div className="section-head">
                  <h2 className="h2">{t("Courses in flight")}</h2>
                  <span className="eyebrow">{t("pick up where you left off")}</span>
                </div>
                <div className="rows" style={{ maxWidth: "52rem" }}>
                  {studying.map((b) => {
                    const pct = Math.round(
                      (Math.min(b.learned, b.cards) / Math.max(b.cards, 1)) * 100,
                    );
                    return (
                      <Link
                        key={b.id}
                        className="row"
                        href={`/learn/${b.owner_handle}/${b.slug}`}
                        data-tint={pct >= 80 ? "green" : undefined}
                      >
                        <span style={{ minWidth: 0 }}>
                          <strong>{b.title}</strong>
                          <span className="row-meta">
                            {markup(t("<0/> of <1/> cards <2/>"), [
                            b.learned,
                            b.cards,
                            pct >= 80 ? t(" · certificate unlocked") : "",
                          ])}</span>
                        </span>
                        <span className="row-side mono" style={{ fontSize: ".75rem" }}>
                          {pct}%
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}

        <section style={{ marginTop: "2.5rem" }}>
          <div className="section-head">
            <h2 className="h2">{t("Achievements")}</h2>
            <span className="eyebrow">
              {markup(t("<0/> of <1/> earned"), [
              done.length,
              CATALOG.length,
            ])}</span>
          </div>
          {/* Two whole sentences, and the branch picks the second one — never
              a sentence assembled from a shared opening and two endings, which
              is the fragment problem wearing a different hat. */}
          {done.length === 0 ? (
            <p className="lede">
              {t("None yet.")}{" "}
              {isMe
                ? markup(t("The <0>full ladder</0> shows what earns each one."), [
                    <Link href="/achievements" style={{ textDecoration: "underline" }} key="s0" />,
                  ])
                : t("Nothing earned on this account so far.")}
            </p>
          ) : (
            <div className="ach-grid">
              {done.map((a) => (
                <div key={a.kind} className="ach-card" data-earned="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/achievements/${a.kind}.webp`}
                    alt=""
                    width={96}
                    height={96}
                    loading="lazy"
                    className="ach-img"
                  />
                  <strong className="ach-title">{a.title}</strong>
                  <span className="ach-blurb">{a.blurb}</span>
                  <span className="mono ach-meta">
                    {earned.get(a.kind)?.toISOString().slice(0, 10)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
