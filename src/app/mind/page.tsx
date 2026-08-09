import { translator } from "@/lib/t";
import { markup } from "@/lib/markup";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { query } from "@/db";
import { currentUser } from "@/lib/session";
import { tintFor } from "@/lib/brains";
import MindMap, { type MindBrain } from "./MindMap";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your mind — mozg" };

/**
 * Everything this account's agents can know, on one screen: own brains,
 * bought ones, added ones — each with what it can be asked (passed exam
 * questions) and where not to trust it (its failures). The same map an agent
 * gets from brain_list, drawn for the human who pays for it.
 */
export default async function MindPage() {
  const t = await translator();

  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/mind");

  const rows = await query<{
    id: string;
    handle: string;
    title: string;
    goal: string | null;
    score: number | null;
    note_count: number;
    color: string;
    access: "own" | "bought" | "added";
    owner_handle: string | null;
    slug: string;
  }>(
    `select b.id, b.slug as handle, b.title, b.goal, b.score, (select coalesce(sum(f.note_count),0) from brains f where f.id = b.id or f.parent_id = b.id)::int as note_count,
            b.color, 'own' as access, u2.handle as owner_handle, b.slug
       from brains b join "user" u2 on u2.id = b.owner_id
      where b.owner_id = $1
     union all
     select b.id, u2.handle || '/' || b.slug, b.title, b.goal, b.score,
            (select coalesce(sum(f.note_count),0) from brains f where f.id = b.id or f.parent_id = b.id)::int, b.color, 'bought', u2.handle, b.slug
       from purchases p join brains b on b.id = p.brain_id
       join "user" u2 on u2.id = b.owner_id
      where p.buyer_id = $1
     union all
     select b.id, u2.handle || '/' || b.slug, b.title, b.goal, b.score,
            (select coalesce(sum(f.note_count),0) from brains f where f.id = b.id or f.parent_id = b.id)::int, b.color, 'added', u2.handle, b.slug
       from library l join brains b on b.id = l.brain_id
       join "user" u2 on u2.id = b.owner_id
      where l.user_id = $1 and b.visibility = 'public'
        and not exists (select 1 from purchases p2
                         where p2.brain_id = b.id and p2.buyer_id = $1)
      order by 5 desc nulls last`,
    [user.id],
  );

  const ids = rows.map((r) => r.id);
  const [calls, canAsk, gaps, cats] = await Promise.all([
    query<{ brain_id: string; n: number }>(
      `select brain_id, count(*)::int as n from calls
        where brain_id = any($1::uuid[]) and caller_id = $2
          and created_at > now() - interval '7 days'
        group by brain_id`,
      [ids, user.id],
    ),
    query<{ brain_id: string; question: string }>(
      `select distinct on (c.brain_id, c.question) c.brain_id, c.question
         from check_results r
         join checks c on c.id = r.check_id
         join check_runs cr on cr.id = r.run_id
        where c.brain_id = any($1::uuid[]) and r.passed
          and cr.id = (select id from check_runs cr2
                        where cr2.brain_id = c.brain_id and cr2.status = 'done'
                        order by started_at desc limit 1)
        limit 200`,
      [ids],
    ),
    query<{ brain_id: string; category: string }>(
      `select distinct c.brain_id, c.category
         from check_results r join checks c on c.id = r.check_id
        where c.brain_id = any($1::uuid[]) and not r.passed
          and r.run_id in (select distinct on (brain_id) id from check_runs
                            where brain_id = any($1::uuid[]) and status = 'done'
                            order by brain_id, started_at desc)`,
      [ids],
    ),
    query<{ brain_id: string; category: string; n: number }>(
      `select brain_id, category, count(*)::int as n from notes
        where brain_id = any($1::uuid[]) and status = 'active' and category is not null
        group by 1, 2 order by 3 desc`,
      [ids],
    ),
  ]);

  const by = <T extends { brain_id: string }>(list: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of list) m.set(x.brain_id, [...(m.get(x.brain_id) ?? []), x]);
    return m;
  };
  const callsBy = new Map(calls.map((c) => [c.brain_id, c.n]));
  const askBy = by(canAsk);
  const gapsBy = by(gaps);
  const catsBy = by(cats);

  const brains: MindBrain[] = rows.map((r) => ({
    handle: r.handle,
    title: r.title,
    goal: r.goal,
    score: r.score,
    notes: r.note_count,
    callsWeek: callsBy.get(r.id) ?? 0,
    access: r.access,
    tint: tintFor({ id: r.id, color: r.color }),
    categories: (catsBy.get(r.id) ?? []).slice(0, 6).map((c) => c.category),
    canAsk: (askBy.get(r.id) ?? []).slice(0, 4).map((c) => c.question),
    gaps: (gapsBy.get(r.id) ?? []).slice(0, 3).map((g) => g.category),
    href:
      r.access === "own" ? `/brains/${r.slug}` : `/b/${r.owner_handle}/${r.slug}`,
  }));

  const totals = {
    notes: brains.reduce((n, b) => n + b.notes, 0),
    calls: brains.reduce((n, b) => n + b.callsWeek, 0),
  };

  // The relay: batons left mid-task, waiting for the next session — any
  // agent, not necessarily the one that left them.
  const handoffs = await query<{
    handle: string;
    title: string;
    agent_client: string | null;
    status: string;
    taken_by: string | null;
    at: string;
  }>(
    `select coalesce(b2.handle, '') as handle, h.title, h.agent_client, h.status, h.taken_by,
            to_char(h.created_at at time zone 'UTC', 'MM-DD HH24:MI') as at
       from handoffs h
       join (select id, slug as handle from brains where id = any($1::uuid[])) b2 on b2.id = h.brain_id
      where h.expires_at > now()
      order by h.created_at desc limit 8`,
    [ids],
  );

  return (
    <AppShell active="/mind" eyebrow={t("Everything your agents can know")} title={t("Your mind")}>
      <p style={{ color: "var(--ink-2)", maxWidth: "62ch", marginTop: 0 }}>
        {markup(t("<0/> brain<1/> · <2/> notes · <3/> of your asks this week. Green — proven on its exam; red — where it honestly fails. Type to find who knows what."), [
        brains.length,
        brains.length === 1 ? "" : "s",
        totals.notes.toLocaleString(),
        totals.calls,
      ])}</p>

      {handoffs.length > 0 && (
        <section style={{ margin: "0 0 1.75rem" }}>
          <div className="section-head">
            <h2 className="h2">{t("Handoffs")}</h2>
            <span className="eyebrow">{t("work left mid-flight, any agent can take it")}</span>
          </div>
          <div className="rows" style={{ maxWidth: "52rem" }}>
            {handoffs.map((h, i) => (
              <div key={i} className="row" data-tint={h.status === "open" ? "orange" : undefined}>
                <span style={{ minWidth: 0 }}>
                  <strong>{h.title}</strong>
                  <span className="row-meta">
                    {markup(t("<0/> · left by <1/> · <2/> <3/>"), [
                    h.handle,
                    h.agent_client ?? t("an agent"),
                    h.at,
                    h.status === "taken" && ` · taken by ${h.taken_by ?? t("an agent")}`,
                  ])}</span>
                </span>
                <span className="row-side mono" style={{ fontSize: ".75rem", color: h.status === "open" ? "var(--color-riso-orange)" : "var(--ink-3)" }}>
                  {h.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <MindMap brains={brains} />
    </AppShell>
  );
}
