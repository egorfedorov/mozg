import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { query } from "@/db";
import { accessForSlug } from "@/lib/access";
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
  const { handle, slug } = await params;
  const user = await currentUser();
  if (!user) redirect(`/sign-in?next=/learn/${handle}/${slug}`);

  const found = await accessForSlug(handle, slug, user.id);
  if (!found?.brain || !found.access) notFound();
  const brain = found.brain;

  const [noteMods, checkMods, progress, due] = await Promise.all([
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
        group by 1`,
      [user.id, brain.id],
    ),
    query<{ n: number }>(
      `select count(*)::int as n from learn_progress
        where user_id = $1 and brain_id = $2 and due_at <= now()`,
      [user.id, brain.id],
    ).then((r) => r[0].n),
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

  return (
    <LearnShell>
    <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
      <p className="eyebrow">
        <Link href="/learn">learn</Link> / course
      </p>
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
          <p className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)", margin: 0 }}>YOU</p>
          <p className="h2" style={{ margin: 0 }}>{pct}%</p>
        </div>
        {brain.score != null && (
          <div>
            <p className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)", margin: 0 }}>YOUR AGENT</p>
            <p className="h2" style={{ margin: 0, color: "var(--ink-2)" }}>{brain.score}%</p>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ height: 10, border: "1.5px solid var(--ink)", background: "var(--paper)" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "var(--color-riso-green)" }} />
          </div>
          <p className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)", margin: ".3rem 0 0" }}>
            {totalLearned} of {totalCards} cards learned
          </p>
        </div>
        {due > 0 && (
          <Link className="btn" href={`/learn/${handle}/${slug}/review`}>
            Review {due} due
          </Link>
        )}
      </div>

      <h2 className="h2" style={{ margin: "2rem 0 1rem" }}>Syllabus</h2>
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
                  {m.notes} notes · {m.checks} exam questions
                  {m.learned > 0 && ` · ${mpct}% learned`}
                </p>
              </div>
              <div style={{ width: 90, height: 8, border: "1px solid var(--ink)", background: "var(--paper)" }}>
                <div style={{ height: "100%", width: `${mpct}%`, background: mpct === 100 ? "var(--color-riso-green)" : "var(--color-riso-red)" }} />
              </div>
              <Link className="btn btn-ghost" style={{ padding: ".4rem .8rem" }} href={`/learn/${handle}/${slug}/study/${encodeURIComponent(m.cat)}`}>
                {m.learned > 0 ? "Continue" : "Study"}
              </Link>
            </div>
          );
        })}
      </div>

      <p style={{ color: "var(--ink-2)", maxWidth: "62ch", marginTop: "1.5rem" }}>
        Each module is the same material your agent searches — read it as a
        lesson, then a short quiz seals it, and spaced review brings each card
        back just before you would forget. Cards you miss return within
        minutes; cards you know retreat for days.
      </p>
    </main>
    </LearnShell>
  );
}
