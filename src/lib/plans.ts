import type { Plan } from "@/db/types";

/**
 * What each plan allows. One table — this used to live in three places (the
 * create action, the upload route, the settings page) with three different
 * shapes, which is exactly how a limit ends up enforced in one path and not
 * the next.
 *
 * The numbers exist to protect the API bill, not the revenue, so they apply
 * on every path into the product: the web app, and an agent over MCP.
 */
export interface PlanLimits {
  brains: number;
  /** Sources per brain. */
  sources: number;
  /** MCP calls per calendar month. */
  calls: number;
  /** Extraction spend per rolling 24h, cents. Protects the API bill from a
      crawl loop; sources that hit it fail with a message and are requeued by
      the maintenance pass once the window rolls over. */
  dailyExtractCents: number;
  /**
   * What the plan actually includes, per rolling 30 days: our inference reading
   * documentation for you. This is the number the price is built on — the daily
   * cap above is only a runaway guard on top of it.
   *
   * It has to be below the price, and visibly so. A $25 plan whose only ceiling
   * was $30 *a day* was selling up to $900 of tokens a month; the ceiling was
   * written as a safety valve and read as an allowance.
   *
   * Zero means "bring your own key or teach from your CLI" — both are unlimited
   * and cost us nothing but an embed.
   */
  monthlyExtractCents: number;
  /** Exam sittings per brain, total. Infinity for paid plans. */
  examSittings: number;
  write: boolean;
  exports: boolean;
}

export const PLANS: Record<Plan, PlanLimits> = {
  // One trial brain, tightly capped: the landing promise ("paste a link, get
  // a brain") must be experienceable before money changes hands, but a free
  // account must never be worth farming. 30 sources (the crawl cap) and a single exam sitting
  // show the whole loop; growing past it is the paid act.
  // write is on for free too: an agent-authored note costs a self-hosted
  // bge-m3 embed, not Anthropic extraction spend — the API-bill argument for
  // the gate never applied to brain_write, and it is the only path that reads
  // this flag.
  // Free reads everything and teaches without limit — from its own CLI or its own
  // API key, where the inference is not ours to pay for. Our models reading for it
  // is a taste, not an allowance: 50¢ a month, about a third of a small brain at
  // the measured 1.46¢ a page. The old shape was 50¢ a *day*, which is $15 a month
  // of our tokens per free account and a thing to farm.
  //
  // The call and source ceilings were the wrong kind of stingy, and the production
  // numbers say why. A search costs us no tokens at all — it is 2.5s of our own
  // CPU against our own index — while the heaviest real caller made 537 searches
  // in a week, which the old 300-a-month ceiling would have stopped on day four.
  // Sources are the same story on a free account: our AI is capped by the 50¢, and
  // anything taught through a key or a CLI costs us one self-hosted embedding.
  // So both go up by an order of magnitude, and the burst limit (60/min) stays as
  // the actual abuse guard.
  //
  // Five exam sittings, not one: agent-written notes now queue a re-sit, each one
  // ~7.5¢ of judge, and a single sitting meant a free brain's score froze the
  // first time its owner taught it. Five is enough to watch the loop move.
  free: { brains: 1, sources: 200, calls: 3000, dailyExtractCents: 50, monthlyExtractCents: 50, examSittings: 5, write: true, exports: false },
  // $25/mo buys $20 of our inference — about 1,300 pages at the measured average,
  // or a few hundred pages plus the exams that grade them at 7.5¢ a sitting. The
  // remaining $5 covers hosting, the embedder, storage and the judge, and is the
  // margin. The daily cap is a fifth of the month, so a runaway crawl loses a day
  // rather than the month. Calls are generous for the same reason as on free: they
  // cost CPU, not tokens, and an agent that hesitates to search is the failure
  // mode this product exists to prevent.
  pro: { brains: 20, sources: 1000, calls: 30_000, dailyExtractCents: 400, monthlyExtractCents: 2000, examSittings: Infinity, write: true, exports: true },
  // $79/mo buys $65 of inference — ~4,400 pages a month across a hundred brains,
  // and enough calls for a room full of agents. Priced under the round hundred on
  // purpose: the ceilings that make this tier are mostly our CPU (brains, calls),
  // not tokens, so the margin can be wider without the number looking greedy.
  // Ceilings, not people: sharing is what a pack purchase does, and it is not
  // gated on a tier — see src/lib/packs.ts.
  team: { brains: 100, sources: 5000, calls: 150_000, dailyExtractCents: 1300, monthlyExtractCents: 6500, examSittings: Infinity, write: true, exports: true },
  // The operator's own account: the catalogue lives here, so the caps are
  // sized for seeding sessions, not for a customer. Not sold anywhere.
  admin: { brains: 10_000, sources: 100_000, calls: 1_000_000, dailyExtractCents: 100_000, monthlyExtractCents: 1_000_000, examSittings: Infinity, write: true, exports: true },
};

export function limitsFor(
  plan: Plan,
  paidUntil?: Date | string | null,
): PlanLimits {
  return PLANS[effectivePlan(plan, paidUntil)] ?? PLANS.free;
}

/** The plans that can be bought. */
export type PaidPlan = "pro" | "team";

/**
 * Monthly price in cents. There is no card checkout yet — this is what the
 * pay-from-balance upgrade charges, and what the settings page shows.
 */
export const PLAN_PRICE_CENTS: Record<PaidPlan, number> = {
  // $25 sits on the same shelf as the agent subscriptions this is used beside —
  // cheap enough to try on a hunch, expensive enough that the $20 of inference in
  // it reads as the point rather than as a giveaway.
  pro: 2500,
  team: 7900,
};

/**
 * The paid plans in ascending order, and the only place that order is written
 * down. The settings page used to carry its own copy as a ternary, which is
 * how a tier once shipped that nobody could buy: it existed, its limits were
 * enforced, and no button offered it.
 */
export const PLAN_LADDER: PaidPlan[] = ["pro", "team"];

/** The plans worth offering to someone on `plan` — strictly above it. */
export function upgradesFrom(plan: Plan): PaidPlan[] {
  // The operator's account is not a customer, and free sits below the whole
  // ladder (indexOf -1 → the entire list, which is what free should see).
  if (plan === "admin") return [];
  return PLAN_LADDER.slice(PLAN_LADDER.indexOf(plan as PaidPlan) + 1);
}

/** How long one payment keeps a plan alive. Not a subscription — nothing renews. */
export const PLAN_PERIOD_DAYS = 30;

/**
 * The plan an account actually has right now.
 *
 * A paid plan is a 30-day purchase: once paid_until passes it reads as free.
 * paid_until null means the plan was set by hand (the operator), and a hand
 * does not expire — otherwise the first nightly read would quietly downgrade
 * every account an operator ever granted.
 */
export function effectivePlan(
  plan: Plan,
  paidUntil?: Date | string | null,
  now: Date = new Date(),
): Plan {
  if (plan !== "pro" && plan !== "team") return plan;
  if (!paidUntil) return plan;
  return new Date(paidUntil).getTime() > now.getTime() ? plan : "free";
}

/**
 * How long an operator's plan grant lasts, as a Postgres interval or null.
 *
 * Null means no expiry, which is what a grant meant before a period existed —
 * so zero months keeps the old behaviour rather than quietly capping anyone.
 *
 * Free never carries a date. A free account with a paid_until is a
 * contradiction the next reader has to puzzle over, and effectivePlan ignores
 * it anyway.
 *
 * The reason the caller must write this on EVERY grant, rather than only when
 * a period is chosen: effectivePlan downgrades pro or team to free once
 * paid_until has passed. Granting pro to somebody whose subscription had
 * lapsed therefore set the plan column and changed nothing, because the stale
 * date was still there voiding it — the operator saw "pro" in the table and
 * the user stayed on free quotas.
 */
export function grantWindow(plan: Plan, months: number): string | null {
  if (plan === "free" || !Number.isFinite(months) || months <= 0) return null;
  return `${Math.floor(months)} months`;
}
