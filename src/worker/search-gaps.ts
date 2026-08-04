import { one, query } from "@/db";
import { clusterQueries, MIN_QUERY_LENGTH, WEAK_TOP_SCORE } from "@/lib/search-gaps";

/**
 * The search-gap harvest. Runs inside the maintenance pass.
 *
 * syncUsageChecks (src/worker/exam.ts) already turns zero-result searches
 * into checks at exam time. This is the wider net, on a schedule instead of
 * at exam time: it also catches searches that returned something too weak to
 * trust (top_score below WEAK_TOP_SCORE — new in 0042, so the zero-result
 * leg carries the feature until the column fills), and it clusters repeat
 * phrasings so the questions people ask MOST become checks first. The insert
 * dedups by question text across every origin, so the two mechanisms never
 * produce the same check twice — whichever sees a gap first files it.
 *
 * Rate limits keep the harvest a trickle: a burst of bad searches (an agent
 * in a retry loop) must not rewrite the exam overnight.
 */

/** Brains visited per pass. */
const BRAIN_BATCH = 10;
/** New gap checks per brain per pass. */
const MAX_NEW_PER_BRAIN = 3;
/** Gap checks a brain may hold at all — the exam is not a search log. */
const MAX_GAP_CHECKS_PER_BRAIN = 15;
/** Weak calls read per brain per pass. */
const CALLS_READ = 200;

export async function growSearchGapChecks(
  limit = BRAIN_BATCH,
): Promise<{ brains: number; added: number }> {
  const weakFilter = `
      tool = 'brain_search' and ok
      and created_at > now() - interval '30 days'
      and (results = 0 or (top_score is not null and top_score < ${WEAK_TOP_SCORE}))
      and length(trim(query)) >= ${MIN_QUERY_LENGTH}`;

  // The brains with the freshest weak calls first — a gap asked yesterday
  // matters more than one from three weeks ago.
  const brains = await query<{ brain_id: string }>(
    `select brain_id from calls
      where brain_id is not null and ${weakFilter}
      group by brain_id order by max(created_at) desc limit $1`,
    [limit],
  );

  let added = 0;
  for (const { brain_id } of brains) {
    const calls = await query<{ query: string }>(
      `select query from calls
        where brain_id = $1 and ${weakFilter}
        order by created_at desc limit ${CALLS_READ}`,
      [brain_id],
    );
    const clusters = clusterQueries(calls.map((c) => c.query));
    if (!clusters.length) continue;

    const { n } = await one<{ n: number }>(
      `select count(*)::int as n from checks where brain_id = $1 and origin = 'search_gap'`,
      [brain_id],
    );
    const room = Math.min(MAX_NEW_PER_BRAIN, MAX_GAP_CHECKS_PER_BRAIN - n);

    for (const cluster of clusters.slice(0, Math.max(0, room))) {
      const inserted = await query(
        `insert into checks (brain_id, category, question, expect, origin)
         select $1, 'asked in real use', $2, $3, 'search_gap'
          where not exists (
            select 1 from checks
             where brain_id = $1 and lower(trim(question)) = lower(trim($2)))
         returning id`,
        [
          brain_id,
          cluster.representative,
          `Material that actually answers this — it was asked ${cluster.count} time(s) ` +
            "and search came back weak.",
        ],
      );
      added += inserted.length;
    }
  }

  return { brains: brains.length, added };
}
