import { translator } from "@/lib/t";
import { markup } from "@/lib/markup";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { query } from "@/db";
import { accessForSlug } from "@/lib/access";
import { achievementAt, recordAchievement } from "@/lib/achievements";
import { accessibleChildren } from "@/lib/families";
import { beatTheAgent, pathStatuses } from "@/lib/learn";
import { currentUser } from "@/lib/session";
import LearnShell from "../../LearnShell";

export const dynamic = "force-dynamic";

/**
 * The course page. A brain's categories are its syllabus: each module is
 * read (the notes, as a lesson), then practised (cards + exam questions),
 * then kept alive by spaced review. This page shows where you are in that
 * loop — per module and overall — the way a course does, not a search box.
 */
export default async function CoursePage({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}) {
  const t = await translator();

  const { handle, slug } = await params;
  const user = await currentUser();
  if (!user) redirect(`/sign-in?next=/learn/${handle}/${slug}`);

  const found = await accessForSlug(handle, slug, user.id);
  if (!found?.brain || !found.access) notFound();
  const brain = found.brain;

  const [noteMods, checkMods, progress, due, streak, family, beatenAt] = await Promise.all([
    query<{ cat: string; total: number }>(
      `select coalesce(category, 'general') as cat, count(*)::int as total
         from notes where brain_id = $1 and status = 'active'
        group by 1 order by 1`,
      [brain.id],
    ),
    query<{ cat: string; total: number }>(
      `select coalesce(category, 'general') as cat, count(*)::int as total
         from checks where brain_id = $1 and enabled group by 1`,
      [brain.id],
    ),
    query<{ cat: string; learned: number }>(
      `select coalesce(coalesce(n.category, c.category), 'general') as cat,
              count(*)::int as learned
         from learn_progress p
         left join notes n on p.kind = 'note' and n.id = p.item_id
         left join checks c on p.kind = 'check' and c.id = p.item_id
        where p.user_id = $1 and p.brain_id = $2 and p.reps > 0
          and p.kind in ('note', 'check')
        group by 1`,
      [user.id, brain.id],
    ),
    query<{ n: number }>(
      `select count(*)::int as n from learn_progress
        where user_id = $1 and brain_id = $2 and due_at <= now()
          and kind in ('note', 'check')`,
      [user.id, brain.id],
    ).then((r) => r[0].n),
    // Consecutive days ending today or yesterday (yesterday keeps the flame
    // alive until tonight's session, the way every streak product does it).
    query<{ n: number }>(
      `with d as (select day from learn_days where user_id = $1),
       run as (
         select day, day + (row_number() over (order by day desc))::int as grp
           from d
       )
       select count(*)::int as n from run
        where grp = (select grp from run where day in (current_date, current_date - 1)
                     order by day desc limit 1)`,
      [user.id],
    ).then((r) => r[0]?.n ?? 0),
    // The family's children, in shelf order (title — the same order
    // childrenOf uses everywhere else). For a child brain this is its
    // siblings, itself included; for a lone brain it is empty and the path
    // block simply does not render.
    accessibleChildren(brain.parent_id ?? brain.id, user.id),
    achievementAt(user.id, brain.id),
  ]);

  const learnedBy = new Map(progress.map((p) => [p.cat, p.learned]));
  const checksBy = new Map(checkMods.map((c) => [c.cat, c.total]));
  const modules = noteMods.map((m) => {
    const total = m.total + (checksBy.get(m.cat) ?? 0);
    return {
      cat: m.cat,
      notes: m.total,
      checks: checksBy.get(m.cat) ?? 0,
      total,
      learned: Math.min(learnedBy.get(m.cat) ?? 0, total),
    };
  });
  const totalCards = modules.reduce((n, m) => n + m.total, 0);
  const totalLearned = modules.reduce((n, m) => n + m.learned, 0);
  const pct = totalCards ? Math.round((totalLearned / totalCards) * 100) : 0;

  // The duel is won the first time the learner's percent passes the brain's
  // own exam score. Recording it here — on the cheap render path — keeps the
  // badge even when the brain re-sits its exam and climbs back ahead.
  let wonAt = beatenAt;
  if (!wonAt && totalCards > 0 && beatTheAgent(pct, brain.score)) {
    await recordAchievement(user.id, brain.id);
    wonAt = new Date();
  }

  // Per-child progress for the family path — the same "learned" definition
  // the modules above use, batched over the family's brains.
  const pathProgress = family.length
    ? await query<{ brain_id: string; cards: number; learned: number }>(
        `select b.id as brain_id,
                (select count(*) from notes n where n.brain_id = b.id and n.status = 'active')::int
              + (select count(*) from checks c where c.brain_id = b.id and c.enabled)::int as cards,
                (select count(*) from learn_progress p
                  where p.user_id = $2 and p.brain_id = b.id and p.reps > 0
                    and p.kind in ('note', 'check'))::int as learned
           from brains b where b.id = any($1::uuid[])`,
        [family.map((f) => f.id), user.id],
      )
    : [];
  const pathById = new Map(pathProgress.map((p) => [p.brain_id, p]));
  const path = family.map((f) => {
    const p = pathById.get(f.id);
    const cards = p?.cards ?? 0;
    const learned = Math.min(p?.learned ?? 0, cards);
    return { ...f, cards, learned, pct: cards ? Math.round((learned / cards) * 100) : 0 };
  });
  const statuses = pathStatuses(path.map((p) => p.pct));
  const pathCards = path.reduce((n, p) => n + p.cards, 0);
  const pathPct = pathCards
    ? Math.round((path.reduce((n, p) => n + p.learned, 0) / pathCards) * 100)
    : 0;

  return (
    <LearnShell>
    <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
      <p className="eyebrow">
        {markup(t("<0>learn</0> / course"), [
        <Link href="/learn" key="s0" />,
      ])}</p>
      <h1 className="display" style={{ fontSize: "clamp(1.8rem, 5vw, 3rem)", margin: ".4rem 0 .75rem" }}>
        {brain.title}
      </h1>
      {brain.goal && (
        <p className="lede" style={{ maxWidth: "62ch", marginTop: 0 }}>
          {brain.goal.split("\n")[0]}
        </p>
      )}

      {/* The scoreboard: you against your agent. */}
      <div
        style={{
          display: "flex",
          gap: "2rem",
          flexWrap: "wrap",
          border: "1.5px solid var(--ink)",
          background: "var(--paper-2)",
          padding: "1rem 1.25rem",
          margin: "1.5rem 0",
          alignItems: "center",
        }}
      >
        <div>
          <p className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)", margin: 0 }}>{t("YOU")}</p>
          <p className="h2" style={{ margin: 0 }}>{pct}%</p>
        </div>
        {brain.score != null && (
          <div>
            <p className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)", margin: 0 }}>{t("YOUR AGENT")}</p>
            <p className="h2" style={{ margin: 0, color: "var(--ink-2)" }}>{brain.score}%</p>
          </div>
        )}
        {brain.score != null && (
          <div>
            <p className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)", margin: 0 }}>{t("CHALLENGE")}</p>
            {wonAt ? (
              <p style={{ margin: 0, fontWeight: 650, color: "var(--color-riso-green)" }}>
                {t("★ You beat your agent")}</p>
            ) : (
              <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)", margin: ".35rem 0 0" }}>
                {markup(t("pass <0/>% to beat it"), [
                brain.score,
              ])}</p>
            )}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ height: 10, border: "1.5px solid var(--ink)", background: "var(--paper)" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "var(--color-riso-green)" }} />
          </div>
          <p className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)", margin: ".3rem 0 0" }}>
            {markup(t("<0/> of <1/> cards learned"), [
            totalLearned,
            totalCards,
          ])}</p>
        </div>
        {streak > 0 && (
          <div>
            <p className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)", margin: 0 }}>{t("STREAK")}</p>
            <p className="h2" style={{ margin: 0 }}>
              {streak}<span style={{ fontSize: ".8em" }}> {streak === 1 ? t("day") : t("days")}</span>
            </p>
          </div>
        )}
        {due > 0 && (
          <Link className="btn" href={`/learn/${handle}/${slug}/review`}>
            {markup(t("Review <0/> due"), [
            due,
          ])}</Link>
        )}
        {pct >= 80 && (
          <Link className="btn btn-ghost" href={`/learn/${handle}/${slug}/certificate`}>
            {t("Certificate →")}</Link>
        )}
      </div>

      {path.length > 0 && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "2rem 0 1rem" }}>
            <h2 className="h2" style={{ margin: 0 }}>{t("Path")}</h2>
            <span className="eyebrow">{markup(t("<0/>% of the family learned"), [
              pathPct,
            ])}</span>
          </div>
          <div style={{ height: 10, border: "1.5px solid var(--ink)", background: "var(--paper)", marginBottom: "1rem" }}>
            <div style={{ height: "100%", width: `${pathPct}%`, background: "var(--color-riso-green)" }} />
          </div>
          <div style={{ display: "grid", gap: "1px", background: "var(--rule)", border: "1.5px solid var(--ink)" }}>
            {path.map((p, i) => (
              <div
                key={p.id}
                style={{
                  background: "var(--paper-2)",
                  padding: "1rem 1.25rem",
                  display: "flex",
                  gap: "1rem",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", width: "2ch" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <p style={{ margin: 0, fontWeight: 650 }}>
                    {p.title}
                    {p.id === brain.id && (
                      <span className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)" }}>
                        {t("· this course")}</span>
                    )}
                  </p>
                  <p className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)", margin: ".15rem 0 0" }}>
                    {markup(t("<0/> cards · <1/>% learned"), [
                    p.cards,
                    p.pct,
                  ])}</p>
                </div>
                <div style={{ width: 90, height: 8, border: "1px solid var(--ink)", background: "var(--paper)" }}>
                  <div style={{ height: "100%", width: `${p.pct}%`, background: p.pct === 100 ? "var(--color-riso-green)" : "var(--color-riso-red)" }} />
                </div>
                <span
                  className="tag"
                  style={{
                    color:
                      statuses[i] === "done"
                        ? "var(--color-riso-green)"
                        : statuses[i] === "current"
                          ? "var(--ink)"
                          : "var(--ink-3)",
                  }}
                >
                  {statuses[i]}
                </span>
                {p.id !== brain.id && (
                  <Link className="btn btn-ghost" style={{ padding: ".4rem .8rem" }} href={`/learn/${handle}/${p.slug}`}>
                    {statuses[i] === "done" ? t("Review") : t("Open")}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="h2" style={{ margin: "2rem 0 1rem" }}>{t("Syllabus")}</h2>
      <div style={{ display: "grid", gap: "1px", background: "var(--rule)", border: "1.5px solid var(--ink)" }}>
        {modules.map((m, i) => {
          const mpct = m.total ? Math.round((m.learned / m.total) * 100) : 0;
          return (
            <div
              key={m.cat}
              style={{
                background: "var(--paper-2)",
                padding: "1rem 1.25rem",
                display: "flex",
                gap: "1rem",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", width: "2ch" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div style={{ flex: 1, minWidth: 200 }}>
                <p style={{ margin: 0, fontWeight: 650 }}>{m.cat}</p>
                <p className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)", margin: ".15rem 0 0" }}>
                  {markup(t("<0/> notes · <1/> exam questions <2/>"), [
                  m.notes,
                  m.checks,
                  m.learned > 0 && ` · ${mpct}% learned`,
                ])}</p>
              </div>
              <div style={{ width: 90, height: 8, border: "1px solid var(--ink)", background: "var(--paper)" }}>
                <div style={{ height: "100%", width: `${mpct}%`, background: mpct === 100 ? "var(--color-riso-green)" : "var(--color-riso-red)" }} />
              </div>
              <Link className="btn btn-ghost" style={{ padding: ".4rem .8rem" }} href={`/learn/${handle}/${slug}/study/${encodeURIComponent(m.cat)}`}>
                {m.learned > 0 ? t("Continue") : t("Study")}
              </Link>
            </div>
          );
        })}
      </div>

      <p style={{ color: "var(--ink-2)", maxWidth: "62ch", marginTop: "1.5rem" }}>
        {t("Each module is the same material your agent searches — read it as a lesson, then a short quiz seals it, and spaced review brings each card back just before you would forget. Cards you miss return within minutes; cards you know retreat for days.")}</p>
    </main>
    </LearnShell>
  );
}
