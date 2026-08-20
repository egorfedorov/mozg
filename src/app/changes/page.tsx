import Link from "next/link";
import { markup } from "@/lib/markup";
import { translator } from "@/lib/t";
import TopBar from "@/components/TopBar";
import Contents from "@/components/Contents";
import SiteFooter from "@/components/SiteFooter";
import { query } from "@/db";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await translator();
  return {
    title: t("The verified changelog — mozg"),
    description: t("What changed across every public brain: exam re-sits diffed against their predecessors, and sources whose content actually moved. Deltas signed by the grader, not written by anyone."),
  };
}

/**
 * The global diff feed. /changelog is what WE shipped; this is what the
 * BRAINS learned — every row a fact from the machinery: a sitting whose
 * score is signed by the judge, a source whose content hash moved. The
 * page a team living on a framework checks on Monday.
 */
export default async function GlobalChangesPage() {
  const t = await translator();

  const sittings = await query<{
    handle: string;
    slug: string;
    title: string;
    score: number | null;
    at: string;
    gained: number;
    lost: number;
  }>(
    `with ordered as (
       select r.id, r.brain_id, r.score, r.started_at,
              lag(r.id) over (partition by r.brain_id order by r.started_at) as prev_id
         from check_runs r
         join brains b on b.id = r.brain_id
        where r.status = 'done' and r.kind = 'full' and b.visibility = 'public')
     select u.handle, b.slug, b.title, o.score,
            to_char(o.started_at at time zone 'UTC', 'YYYY-MM-DD') as at,
            coalesce((select count(*)::int from check_results cur
               join check_results prev on prev.check_id = cur.check_id and prev.run_id = o.prev_id
              where cur.run_id = o.id and cur.passed and not prev.passed), 0) as gained,
            coalesce((select count(*)::int from check_results cur
               join check_results prev on prev.check_id = cur.check_id and prev.run_id = o.prev_id
              where cur.run_id = o.id and not cur.passed and prev.passed), 0) as lost
       from ordered o
       join brains b on b.id = o.brain_id
       join "user" u on u.id = b.owner_id
      where u.handle is not null
      order by o.started_at desc
      limit 30`,
  );

  const moved = await query<{ handle: string; slug: string; title: string; name: string; at: string }>(
    `select u.handle, b.slug, b.title,
            coalesce(s.original_name, s.url, s.kind) as name,
            to_char(s.changed_at at time zone 'UTC', 'YYYY-MM-DD') as at
       from sources s
       join brains b on b.id = s.brain_id
       join "user" u on u.id = b.owner_id
      where s.changed_at is not null and b.visibility = 'public' and u.handle is not null
      order by s.changed_at desc limit 20`,
  );

  return (
    <>
      <TopBar />
      <Contents active="/changes" />
      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">{t("The verified changelog · every public brain")}</p>
        <h1 className="display" style={{ fontSize: "clamp(1.8rem, 5vw, 3rem)", margin: ".5rem 0 1rem" }}>
          {t("What the brains learned.")}</h1>
        <p className="lede" style={{ maxWidth: "60ch" }}>
          {markup(t("<0>/changelog</0> is what we shipped; this is what the knowledge did. Every row is a fact from the machinery — an exam re-sat and diffed against the sitting before it, or a source whose content hash actually moved. Nobody writes this page; it happens."), [
          <Link href="/changelog" style={{ textDecoration: "underline" }} key="s0" />,
        ])}</p>

        <section style={{ marginTop: "2.5rem" }}>
          <div className="section-head">
            <h2 className="h2">{t("Recent sittings")}</h2>
            <span className="eyebrow">{t("each diffed against its predecessor")}</span>
          </div>
          {sittings.length === 0 ? (
            <p className="lede">{t("The first public sitting will land here.")}</p>
          ) : (
            <div className="rows" style={{ maxWidth: "56rem" }}>
              {sittings.map((s, i) => (
                <Link key={i} className="row" href={`/b/${s.handle}/${s.slug}/changes`}>
                  <span style={{ minWidth: 0 }}>
                    <strong>{s.title}</strong>
                    <span className="row-sub">
                      {s.gained > 0 && (
                        <span style={{ color: "var(--color-riso-green)" }}>{markup(t("+<0/> newly passed"), [
                          s.gained,
                        ])}</span>
                      )}
                      {s.gained > 0 && s.lost > 0 && " · "}
                      {s.lost > 0 && (
                        <span style={{ color: "var(--color-riso-red)" }}>{markup(t("−<0/> lost"), [
                          s.lost,
                        ])}</span>
                      )}
                      {s.gained === 0 && s.lost === 0 && t("held steady")}
                    </span>
                    <span className="row-meta">{s.at}</span>
                  </span>
                  <span className="row-side mono">{s.score === null ? "—" : `${s.score}%`}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section style={{ marginTop: "2.5rem" }}>
          <div className="section-head">
            <h2 className="h2">{t("Sources that moved")}</h2>
            <span className="eyebrow">{t("hash-detected, re-read, then re-examined")}</span>
          </div>
          {moved.length === 0 ? (
            <p className="lede">{t("Quiet — the watched documentation is as it was.")}</p>
          ) : (
            <div className="rows" style={{ maxWidth: "56rem" }}>
              {moved.map((m, i) => (
                <Link key={i} className="row" href={`/b/${m.handle}/${m.slug}/changes`}>
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ overflowWrap: "anywhere" }}>{m.name}</strong>
                    <span className="row-meta">{markup(t("in <0/>"), [
                      m.title,
                    ])}</span>
                  </span>
                  <span className="row-side mono">{m.at}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
