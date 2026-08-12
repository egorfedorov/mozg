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

/**
 * How many DIFFERENT people must hit a gap before it becomes an exam question
 * on a brain the public can buy.
 *
 * The harvest used to count calls. One studio working on one game asked five
 * brains about "red mesa showdown", "iron grip bonus D symbol strip weights"
 * and "capo noir BONUS CTA" — retried, as people do — and thirteen questions
 * about two unreleased games became permanent checks on three paid brains.
 * Every buyer's score was then depressed by questions no other buyer would
 * ever ask and the author could never answer, because the games are not
 * theirs. Repetition by one person is not demand; two people is the cheapest
 * signal that separates them.
 *
 * A private brain keeps the old behaviour: there the one caller IS the
 * audience, and their project is exactly what the brain is for.
 */
const MIN_CALLERS_PUBLIC = 2;

export async function growSearchGapChecks(
  limit = BRAIN_BATCH,
): Promise<{ brains: number; added: number }> {
  // Written per alias rather than pasted twice: the brain-picking query joins
  // brains, where created_at also exists, so an unqualified column there is
  // ambiguous — and a filter that reads right but binds to the wrong table is
  // the kind of bug that ships green.
  const weak = (t: string) => `
      ${t}.tool = 'brain_search' and ${t}.ok
      and ${t}.created_at > now() - interval '30 days'
      and (${t}.results = 0
           or (${t}.top_score is not null and ${t}.top_score < ${WEAK_TOP_SCORE}))
      and length(trim(${t}.query)) >= ${MIN_QUERY_LENGTH}`;

  // The brains with the freshest weak calls first — a gap asked yesterday
  // matters more than one from three weeks ago.
  const brains = await query<{ brain_id: string; visibility: string }>(
    `select c.brain_id, b.visibility from calls c
       join brains b on b.id = c.brain_id
      where c.brain_id is not null and ${weak("c")}
      group by c.brain_id, b.visibility order by max(c.created_at) desc limit $1`,
    [limit],
  );

  let added = 0;
  for (const { brain_id, visibility } of brains) {
    const calls = await query<{ query: string; caller_id: string }>(
      `select calls.query, calls.caller_id from calls
        where calls.brain_id = $1 and ${weak("calls")}
        order by calls.created_at desc limit ${CALLS_READ}`,
      [brain_id],
    );
    const minCallers = visibility === "public" ? MIN_CALLERS_PUBLIC : 1;
    const clusters = clusterQueries(
      calls.map((c) => ({ query: c.query, callerId: c.caller_id })),
    ).filter((c) => c.callers >= minCallers);
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
          `Material that actually answers this — ${cluster.callers} caller(s) asked it ` +
            `${cluster.count} time(s) and search came back weak.`,
        ],
      );
      added += inserted.length;
    }
  }

  return { brains: brains.length, added };
}
