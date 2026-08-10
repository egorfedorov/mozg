import Link from "next/link";
import { translator } from "@/lib/t";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import { query } from "@/db";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Catalogue health — mozg",
  description:
    "How much of the catalogue was read this week, re-examined this week, and what it scores. The pace of a beta, in public.",
};

/**
 * The catalogue, measured in public.
 *
 * Two reasons this is a page and not an admin panel. A visitor deciding
 * whether to trust a young catalogue is asking exactly these questions — is
 * anyone tending it, does the score mean anything, how old is the material —
 * and the honest answer is a number, not a paragraph. And a public number
 * disciplines the shelf: an empty brain or a stale one is embarrassing where
 * everyone can see it, which is the point.
 */
export default async function HealthPage() {
  const t = await translator();

  const [row] = await query<{
    public_brains: number;
    notes: number;
    examined: number;
    avg_score: number | null;
    read_week: number;
    exams_week: number;
    fresh_week: number;
    stale_month: number;
    routes: number;
  }>(
    `select
       (select count(*)::int from brains
         where visibility = 'public' and parent_id is null) as public_brains,
       (select count(*)::int from notes where status = 'active') as notes,
       (select count(*)::int from brains
         where visibility = 'public' and parent_id is null and score is not null) as examined,
       (select round(avg(score))::int from brains
         where visibility = 'public' and parent_id is null and score is not null) as avg_score,
       (select count(*)::int from sources
         where processed_at > now() - interval '7 days') as read_week,
       (select count(*)::int from check_runs
         where status = 'done' and started_at > now() - interval '7 days') as exams_week,
       -- Families count as one: a parent read through its children is fresh.
       (select count(*)::int from brains b
         where b.visibility = 'public' and b.parent_id is null
           and exists (select 1 from sources s
                        where (s.brain_id = b.id
                               or s.brain_id in (select id from brains c2 where c2.parent_id = b.id))
                          and s.processed_at > now() - interval '7 days')) as fresh_week,
       (select count(*)::int from brains b
         where b.visibility = 'public' and b.parent_id is null
           and not exists (select 1 from sources s
                            where (s.brain_id = b.id
                                   or s.brain_id in (select id from brains c3 where c3.parent_id = b.id))
                              and s.processed_at > now() - interval '30 days')) as stale_month,
       (select count(*)::int from workflows where visibility = 'public') as routes`,
  );

  const recent = await query<{
    slug: string;
    handle: string;
    title: string;
    score: number;
    started_at: Date;
  }>(
    `select b.slug, u.handle, b.title, r.score, r.started_at
       from check_runs r
       join brains b on b.id = r.brain_id
       join "user" u on u.id = b.owner_id
      where r.status = 'done' and r.kind = 'full' and b.visibility = 'public'
        and r.score is not null
      order by r.started_at desc
      limit 12`,
  );

  return (
    <>
      <TopBar />
      <Contents active="/health" />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">{t("Catalogue health · updated as you load it")}</p>
        <h1
          className="display"
          style={{ fontSize: "clamp(1.9rem, 5vw, 3rem)", margin: ".4rem 0 1rem" }}
        >
          {t("How much of this is actually tended.")}
        </h1>
        <p style={{ color: "var(--ink-2)", maxWidth: "58ch", marginTop: 0 }}>
          {t("Every brain here states a goal and sits an exam against it. These are the numbers behind that claim — how many were read this week, how many re-sat their exam, and what the catalogue averages.")}
        </p>

        <div className="stats" style={{ marginTop: "2rem" }}>
          <div className="stat">
            <span className="eyebrow">{t("Public brains")}</span>
            <span className="stat-value" data-big>{row?.public_brains ?? 0}</span>
            <span className="stat-note">{row?.examined ?? 0} {t("examined")}</span>
          </div>
          <div className="stat">
            <span className="eyebrow">{t("Average score")}</span>
            <span className="stat-value" data-big>{row?.avg_score ?? "—"}%</span>
            <span className="stat-note">{t("across every examined brain")}</span>
          </div>
          <div className="stat">
            <span className="eyebrow">{t("Notes")}</span>
            <span className="stat-value">{(row?.notes ?? 0).toLocaleString()}</span>
          </div>
          <div className="stat">
            <span className="eyebrow">{t("Pages read · 7d")}</span>
            <span className="stat-value">{(row?.read_week ?? 0).toLocaleString()}</span>
          </div>
          <div className="stat">
            <span className="eyebrow">{t("Exams sat · 7d")}</span>
            <span className="stat-value">{row?.exams_week ?? 0}</span>
          </div>
          <div className="stat">
            <span className="eyebrow">{t("Brains fed · 7d")}</span>
            <span className="stat-value">{row?.fresh_week ?? 0}</span>
            <span className="stat-note">
              {row?.stale_month ?? 0} {t("untouched for a month")}
            </span>
          </div>
          <div className="stat">
            <span className="eyebrow">{t("Workflows")}</span>
            <span className="stat-value">{row?.routes ?? 0}</span>
            <span className="stat-note">{t("published routes")}</span>
          </div>
        </div>

        <h2 className="h2" style={{ marginTop: "2.5rem" }}>
          {t("The last exams sat")}
        </h2>
        <p style={{ color: "var(--ink-2)", marginTop: 0 }}>
          {t("Newest first. A brain re-sits whenever it learns something, so this is also the record of what changed.")}
        </p>
        <div className="rows">
          {recent.map((r, i) => (
            <Link className="row" key={i} href={`/b/${r.handle}/${r.slug}`}>
              <span style={{ minWidth: 0 }}>
                <strong>{r.title}</strong>
                <span className="row-meta">
                  {r.handle}/{r.slug} · {new Date(r.started_at).toISOString().slice(0, 16).replace("T", " ")}
                </span>
              </span>
              <span className="row-side">{r.score}%</span>
            </Link>
          ))}
        </div>

        <p style={{ marginTop: "2rem" }}>
          <Link className="btn" href="/explore">
            {t("Browse the catalogue")}
          </Link>
        </p>
      </main>

      <SiteFooter />
    </>
  );
}
