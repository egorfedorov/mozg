import { query } from "@/db";

/**
 * Achievements, two shapes in one table:
 *
 *  - per-brain: the course-page duel (beat_the_agent), brain_id set. The
 *    "did they win" check is pure (beatTheAgent in lib/learn.ts); the row
 *    only remembers the first crossing so the badge survives the brain
 *    re-sitting its exam and climbing back ahead.
 *  - account-wide: the CATALOG below ("made ten brains"), brain_id null.
 *    Conditions are simple thresholds over counts the product already keeps,
 *    computed lazily and recorded on first crossing — same idempotent
 *    write-on-render pattern as the duel.
 *
 * seen_at is the notification bit: earned but unseen is what the mascot's
 * badge counts, and opening the drawer clears it.
 */

export const BEAT_THE_AGENT = "beat_the_agent";

// ─── the catalog ─────────────────────────────────────────────────────────────

export interface UserStats {
  brains: number;
  sources: number;
  notes: number;
  public_brains: number;
  priced: number;
  graded: number;
  best_score: number;
  calls: number;
  bought: number;
  sold: number;
  reviews: number;
  duels: number;
  best_streak: number;
  paid_topups: number;
}

export interface AchievementDef {
  kind: string;
  title: string;
  /** How to earn it — shown on the locked badge. */
  blurb: string;
  stat: keyof UserStats;
  goal: number;
}

export const CATALOG: AchievementDef[] = [
  { kind: "first_brain", title: "First brain", blurb: "Make your first brain.", stat: "brains", goal: 1 },
  { kind: "five_brains", title: "Five brains", blurb: "Five brains on the shelf.", stat: "brains", goal: 5 },
  { kind: "ten_brains", title: "Ten brains", blurb: "Ten brains — a proper library.", stat: "brains", goal: 10 },
  { kind: "first_source", title: "First source", blurb: "Feed a brain its first source.", stat: "sources", goal: 1 },
  { kind: "fifty_sources", title: "Well fed", blurb: "Fifty sources across your brains.", stat: "sources", goal: 50 },
  { kind: "hundred_notes", title: "Hundred notes", blurb: "A hundred notes distilled.", stat: "notes", goal: 100 },
  { kind: "thousand_notes", title: "Thousand notes", blurb: "A thousand notes. That is a mind.", stat: "notes", goal: 1000 },
  { kind: "first_public", title: "Went public", blurb: "Publish a brain to the catalogue.", stat: "public_brains", goal: 1 },
  { kind: "on_sale", title: "On sale", blurb: "Put a price on a brain.", stat: "priced", goal: 1 },
  { kind: "graded", title: "Sat the exam", blurb: "A brain of yours took its exam.", stat: "graded", goal: 1 },
  { kind: "honors", title: "With honors", blurb: "A brain scored 90 or higher.", stat: "best_score", goal: 90 },
  { kind: "connected", title: "Plugged in", blurb: "Your agent made its first call.", stat: "calls", goal: 1 },
  { kind: "hundred_calls", title: "Hundred calls", blurb: "Your agent called brains a hundred times.", stat: "calls", goal: 100 },
  { kind: "first_purchase", title: "First buy", blurb: "Buy someone else's brain.", stat: "bought", goal: 1 },
  { kind: "first_sale", title: "First sale", blurb: "Someone bought a brain of yours.", stat: "sold", goal: 1 },
  { kind: "reviewer", title: "Critic", blurb: "Review a brain you bought.", stat: "reviews", goal: 1 },
  { kind: "duelist", title: "Beat the agent", blurb: "Outscore a brain's own exam.", stat: "duels", goal: 1 },
  { kind: "scholar", title: "Scholar", blurb: "Beat the agent on three brains.", stat: "duels", goal: 3 },
  { kind: "week_streak", title: "Seven days", blurb: "Study seven days in a row.", stat: "best_streak", goal: 7 },
  { kind: "patron", title: "Patron", blurb: "Your first paid top-up.", stat: "paid_topups", goal: 1 },
];

const BY_KIND = new Map(CATALOG.map((a) => [a.kind, a]));

// ─── computing and recording ─────────────────────────────────────────────────

/** Every number the catalog judges, in one round trip of indexed counts. */
export async function userStats(userId: string): Promise<UserStats> {
  const [row] = await query<UserStats>(
    `select
       (select count(*)::int from brains where owner_id = $1) as brains,
       (select count(*)::int from sources s join brains b on b.id = s.brain_id
         where b.owner_id = $1) as sources,
       (select coalesce(sum(note_count), 0)::int from brains where owner_id = $1) as notes,
       (select count(*)::int from brains where owner_id = $1 and visibility = 'public') as public_brains,
       (select count(*)::int from brains where owner_id = $1 and price_cents > 0) as priced,
       (select count(*)::int from brains where owner_id = $1 and score is not null) as graded,
       (select coalesce(max(score), 0)::int from brains where owner_id = $1) as best_score,
       (select count(*)::int from calls where caller_id = $1) as calls,
       (select count(*)::int from purchases where buyer_id = $1) as bought,
       (select count(*)::int from purchases where seller_id = $1) as sold,
       (select count(*)::int from reviews where buyer_id = $1) as reviews,
       (select count(*)::int from achievements
         where user_id = $1 and kind = '${BEAT_THE_AGENT}' and brain_id is not null) as duels,
       -- Longest run of consecutive study days: days minus their rank collapse
       -- to one value per unbroken island.
       (select coalesce(max(n), 0)::int from (
          select count(*) as n from (
            select day - (row_number() over (order by day))::int as island
              from learn_days where user_id = $1) g
          group by island) s) as best_streak,
       (select count(*)::int from topups where user_id = $1 and status = 'paid') as paid_topups`,
    [userId],
  );
  return row;
}

/**
 * Compare the numbers to the catalog and remember any new crossings.
 * Idempotent, so callers run it on render without a separate write path.
 */
export async function syncAchievements(userId: string): Promise<UserStats> {
  const stats = await userStats(userId);
  const met = CATALOG.filter((a) => stats[a.stat] >= a.goal).map((a) => a.kind);
  if (met.length) {
    await query(
      `insert into achievements (user_id, kind)
       select $1, unnest($2::text[])
       on conflict (user_id, kind) where brain_id is null do nothing`,
      [userId, met],
    );
  }
  return stats;
}

/** kind → when, for every account-wide badge this person holds. */
export async function globalAchievements(
  userId: string,
): Promise<Map<string, Date>> {
  const rows = await query<{ kind: string; achieved_at: Date }>(
    `select kind, achieved_at from achievements
      where user_id = $1 and brain_id is null`,
    [userId],
  );
  return new Map(rows.map((r) => [r.kind, r.achieved_at]));
}

/** Earned but not yet shown — what the mascot's badge counts. */
export async function unseenAchievements(userId: string): Promise<AchievementDef[]> {
  const rows = await query<{ kind: string }>(
    `select kind from achievements
      where user_id = $1 and brain_id is null and seen_at is null
      order by achieved_at asc`,
    [userId],
  );
  return rows.map((r) => BY_KIND.get(r.kind)).filter((a): a is AchievementDef => Boolean(a));
}

export async function markAchievementsSeen(userId: string): Promise<void> {
  await query(
    `update achievements set seen_at = now()
      where user_id = $1 and brain_id is null and seen_at is null`,
    [userId],
  );
}

// ─── the per-brain duel (unchanged) ──────────────────────────────────────────

/** When this person first earned the achievement on this brain, if ever. */
export async function achievementAt(
  userId: string,
  brainId: string,
  kind: string = BEAT_THE_AGENT,
): Promise<Date | null> {
  const rows = await query<{ achieved_at: Date }>(
    `select achieved_at from achievements
      where user_id = $1 and brain_id = $2 and kind = $3`,
    [userId, brainId, kind],
  );
  return rows[0]?.achieved_at ?? null;
}

/**
 * Record the first crossing. `on conflict do nothing` keeps it idempotent —
 * the course page calls this on render whenever the duel reads as won.
 */
export async function recordAchievement(
  userId: string,
  brainId: string,
  kind: string = BEAT_THE_AGENT,
): Promise<void> {
  await query(
    `insert into achievements (user_id, brain_id, kind) values ($1, $2, $3)
     on conflict (user_id, brain_id, kind) do nothing`,
    [userId, brainId, kind],
  );
}

/** Every brain this person holds the achievement on — the shelf's badges. */
export async function achievedBrainIds(
  userId: string,
  kind: string = BEAT_THE_AGENT,
): Promise<Set<string>> {
  const rows = await query<{ brain_id: string }>(
    `select brain_id from achievements where user_id = $1 and kind = $2`,
    [userId, kind],
  );
  return new Set(rows.map((r) => r.brain_id));
}
