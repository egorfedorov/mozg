import { query } from "@/db";

/**
 * What the dashboard needs to answer, in one round trip each:
 * what happened, what is waiting for me, and what is worth doing next.
 */

export interface Attention {
  kind: "review" | "failed" | "no-goal" | "gap" | "unexamined" | "unreachable";
  brainSlug: string;
  brainTitle: string;
  count?: number;
  detail: string;
  href: string;
}

export interface DashboardStats {
  brains: number;
  notes: number;
  callsWeek: number;
  callsPrevWeek: number;
  balanceCents: number;
}

export async function dashboardStats(userId: string): Promise<DashboardStats> {
  const row = await query<DashboardStats>(
    `select
       (select count(*)::int from brains where owner_id = $1) as brains,
       (select coalesce(sum(note_count), 0)::int from brains where owner_id = $1) as notes,
       (select count(*)::int from calls
          where caller_id = $1 and created_at > now() - interval '7 days') as "callsWeek",
       (select count(*)::int from calls
          where caller_id = $1
            and created_at > now() - interval '14 days'
            and created_at <= now() - interval '7 days') as "callsPrevWeek",
       (select balance_cents from "user" where id = $1) as "balanceCents"`,
    [userId],
  );
  return row[0];
}

/**
 * Things the owner has to decide, most actionable first. Deliberately not a
 * notification feed: every row here has a next step attached, or it does not
 * belong on the screen.
 */
export async function needsAttention(userId: string): Promise<Attention[]> {
  const [pending, failed, noGoal, unexamined, gaps, unreachable] = await Promise.all([
    query<{ slug: string; title: string; n: number }>(
      `select b.slug, b.title, count(*)::int as n
         from notes n join brains b on b.id = n.brain_id
        where b.owner_id = $1 and n.status = 'pending'
        group by b.slug, b.title order by n desc`,
      [userId],
    ),
    query<{ slug: string; title: string; n: number }>(
      `select b.slug, b.title, count(*)::int as n
         from sources s join brains b on b.id = s.brain_id
        where b.owner_id = $1 and s.status in ('failed', 'rejected')
        group by b.slug, b.title order by n desc`,
      [userId],
    ),
    query<{ slug: string; title: string }>(
      `select slug, title from brains
        where owner_id = $1 and goal is null and note_count > 0`,
      [userId],
    ),
    query<{ slug: string; title: string }>(
      `select slug, title from brains
        where owner_id = $1 and goal is not null and score is null and note_count > 0`,
      [userId],
    ),
    // The weakest category of each examined brain — the single most useful
    // "what should I upload next" the product can produce.
    query<{ slug: string; title: string; category: string; passed: number; total: number }>(
      `with latest as (
         select distinct on (brain_id) id, brain_id from check_runs
          where status = 'done' order by brain_id, started_at desc
       ),
       scored as (
         select b.id as bid, b.slug, b.title, c.category,
                count(r.passed) filter (where r.passed)::int as passed,
                count(*)::int as total,
                row_number() over (
                  partition by b.id
                  order by count(r.passed) filter (where r.passed)::float / count(*)
                ) as rank
           from checks c
           join brains b on b.id = c.brain_id
           join latest l on l.brain_id = b.id
           join check_results r on r.check_id = c.id and r.run_id = l.id
          where b.owner_id = $1
          group by b.id, b.slug, b.title, c.category
       )
       select slug, title, category, passed, total from scored
        where rank = 1 and passed < total`,
      [userId],
    ),
    // Pages the refresh pass could not read. A page that 404s is the one kind
    // of decay the owner has to act on — everything else the brain fixes
    // itself.
    query<{ slug: string; title: string; n: number }>(
      `select b.slug, b.title, count(*)::int as n
         from sources s join brains b on b.id = s.brain_id
        where b.owner_id = $1 and s.kind = 'url' and s.status = 'ready'
          and s.error is not null
        group by b.slug, b.title order by n desc`,
      [userId],
    ),
  ]);

  const items: Attention[] = [];

  for (const r of pending) {
    items.push({
      kind: "review",
      brainSlug: r.slug,
      brainTitle: r.title,
      count: r.n,
      detail: `${r.n} note${r.n === 1 ? "" : "s"} written by agents, waiting for you`,
      href: `/brains/${r.slug}`,
    });
  }
  for (const r of failed) {
    items.push({
      kind: "failed",
      brainSlug: r.slug,
      brainTitle: r.title,
      count: r.n,
      detail: `${r.n} source${r.n === 1 ? "" : "s"} did not go through`,
      href: `/brains/${r.slug}`,
    });
  }
  for (const r of noGoal) {
    items.push({
      kind: "no-goal",
      brainSlug: r.slug,
      brainTitle: r.title,
      detail: "no goal set, so it cannot be examined",
      href: `/brains/${r.slug}`,
    });
  }
  for (const r of unexamined) {
    items.push({
      kind: "unexamined",
      brainSlug: r.slug,
      brainTitle: r.title,
      detail: "has never sat its exam",
      href: `/brains/${r.slug}`,
    });
  }
  for (const r of unreachable) {
    items.push({
      kind: "unreachable",
      brainSlug: r.slug,
      brainTitle: r.title,
      count: r.n,
      detail: `${r.n} page${r.n === 1 ? "" : "s"} stopped answering — the notes from ${r.n === 1 ? "it" : "them"} may be stale`,
      href: `/brains/${r.slug}`,
    });
  }
  for (const r of gaps) {
    items.push({
      kind: "gap",
      brainSlug: r.slug,
      brainTitle: r.title,
      detail: `weakest area: ${r.category} — ${r.passed} of ${r.total}`,
      href: `/brains/${r.slug}`,
    });
  }

  return items;
}

export interface RecentCall {
  id: string;
  tool: string;
  query: string | null;
  results: number | null;
  ok: boolean;
  created_at: string;
  brain_title: string | null;
  brain_slug: string | null;
}

export async function recentActivity(userId: string, limit = 12): Promise<RecentCall[]> {
  return query<RecentCall>(
    `select c.id::text, c.tool, c.query, c.results, c.ok,
            to_char(c.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
            b.title as brain_title, b.slug as brain_slug
       from calls c left join brains b on b.id = c.brain_id
      where c.caller_id = $1 or b.owner_id = $1
      order by c.id desc limit $2`,
    [userId, limit],
  );
}
