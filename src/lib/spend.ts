import { query } from "@/db";
import { byokStorage } from "@/lib/byok";

/**
 * Record what a model call cost us.
 *
 * Extraction and exams keep their cost on the row they belong to; everything
 * else lands here, so "what did today cost" is one query rather than a guess.
 * Calls made on a user's own key are not our spend and are not recorded —
 * counting them would inflate our numbers with money we never paid.
 */
export async function recordSpend(
  kind: string,
  cents: number,
  opts: { brainId?: string; model?: string } = {},
): Promise<void> {
  if (!cents || byokStorage.getStore()) return;
  await query(
    `insert into spend (kind, brain_id, cents, model) values ($1, $2, $3, $4)`,
    [kind, opts.brainId ?? null, cents, opts.model ?? null],
  ).catch(() => {
    // Accounting must never fail the work it is accounting for.
  });
}

/**
 * The three places money lands, as one SQL sum.
 *
 * Extraction keeps its cost on `sources`, exams on `check_runs`, and
 * everything else in `spend` — nothing joins them, so every reader of "what
 * did this cost" has to remember all three. Three of the six lanes that spend
 * money forgot to write a `spend` row at some point, and a $11/day exam
 * regression ran for a week because the obvious query (`select sum(cents) from
 * spend`) showed pennies and looked fine.
 *
 * So the knowledge of which tables hold money lives here once, and both the
 * admin tile and the budget guard below read it from the same place.
 *
 * `since` is an interval literal and is interpolated, so it is validated to
 * digits plus a unit rather than trusted — it is internal today and one
 * careless caller away from not being.
 */
export function spendSumSql(since: string): string {
  if (!/^\d+ (hours|days)$/.test(since)) {
    throw new Error(`spendSumSql: bad interval ${JSON.stringify(since)}`);
  }
  return `(
      (select coalesce(sum(cost_cents), 0) from sources
        where processed_at > now() - interval '${since}')
    + (select coalesce(sum(cost_cents), 0) from check_runs
        where started_at > now() - interval '${since}')
    + (select coalesce(sum(cents), 0) from spend
        where created_at > now() - interval '${since}')
  )`;
}

/** What the platform has spent on models across every lane and every owner. */
export async function platformSpentCents(since = "24 hours"): Promise<number> {
  const [row] = await query<{ cents: number }>(
    `select ${spendSumSql(since)}::int as cents`,
  );
  return row?.cents ?? 0;
}

/**
 * The ceiling for scheduled model work, per rolling 24h.
 *
 * `plans.dailyExtractCents` caps extraction *per owner*, which is the guard
 * against one runaway crawl. It is not a guard on the platform: the exam lane
 * has no cap at all, and exams are the big lane — $11.57/day against $3.87 of
 * extraction in the week to 2026-08-19. Nothing watched the prepaid balance
 * either, so when it hit zero on 08-16 the first anyone knew was 169 error
 * rows.
 *
 * Set well above a normal day (~$15) and below a runaway one: a 2x regression
 * trips it, an ordinary Tuesday never does. It throttles the *scheduled* lane
 * only — see holdScheduledSpend.
 */
export const PLATFORM_DAILY_CENTS = Number(process.env.PLATFORM_DAILY_CENTS ?? 3000);

/**
 * Should the maintenance pass skip the work that costs money this round?
 *
 * Deliberately not a hard stop on everything: an owner who clicks "re-sit", or
 * an ingest that just finished a source, is work somebody is waiting for and
 * is already capped per-owner. What has no ceiling and nobody is waiting for
 * is the periodic re-sit, which is where the money measurably goes. Pausing
 * that costs a day of freshness on brains that, by the same measurement,
 * mostly nobody is searching.
 *
 * Zero or a negative ceiling disables the guard, so a self-hoster on their own
 * key is never throttled by our number.
 */
export async function holdScheduledSpend(): Promise<{ hold: boolean; spent: number }> {
  if (!(PLATFORM_DAILY_CENTS > 0)) return { hold: false, spent: 0 };
  const spent = await platformSpentCents("24 hours");
  return { hold: spent >= PLATFORM_DAILY_CENTS, spent };
}
