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
  // Free reads everything and teaches without limit — from its own CLI or its
  // own API key, where the inference is not ours to pay for. Our models reading
  // for it is a taste, not an allowance: 50¢ a month, which is one small brain
  // built once. The old shape was 50¢ a *day*, which is $15 a month of our
  // tokens per free account and a thing to farm; the same number with a monthly
  // window is a trial that cannot be repeated, and the landing promise ("paste a
  // link, get a brain") stays true without a card.
  free: { brains: 1, sources: 30, calls: 300, dailyExtractCents: 50, monthlyExtractCents: 50, examSittings: 1, write: true, exports: false },
  // $25/mo buys $20 of our inference. The remaining five cover hosting, the
  // embedder, storage and the exams' judge — and are the margin. The daily cap
  // is a fifth of the month, so a runaway crawl loses a day, not the month.
  pro: { brains: 20, sources: 1000, calls: 10_000, dailyExtractCents: 400, monthlyExtractCents: 2000, examSittings: Infinity, write: true, exports: true },
  // $95/mo buys $90, same arithmetic at team scale.
  team: { brains: 100, sources: 5000, calls: 50_000, dailyExtractCents: 1800, monthlyExtractCents: 9000, examSittings: Infinity, write: true, exports: true },
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
  pro: 2500,
  team: 9500,
};

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
