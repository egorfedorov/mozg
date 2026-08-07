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
  /**
   * People who may work on this account's brains, the owner included. One on
   * every plan but studio: a seat is the thing a studio actually buys, and
   * pretending otherwise is how "team" ended up meaning "higher ceilings".
   */
  seats: number;
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
  free: { seats: 1, brains: 1, sources: 200, calls: 3000, dailyExtractCents: 50, monthlyExtractCents: 50, examSittings: 5, write: true, exports: false },
  // $25/mo buys $20 of our inference — about 1,300 pages at the measured average,
  // or a few hundred pages plus the exams that grade them at 7.5¢ a sitting. The
  // remaining $5 covers hosting, the embedder, storage and the judge, and is the
  // margin. The daily cap is a fifth of the month, so a runaway crawl loses a day
  // rather than the month. Calls are generous for the same reason as on free: they
  // cost CPU, not tokens, and an agent that hesitates to search is the failure
  // mode this product exists to prevent.
  pro: { seats: 1, brains: 20, sources: 1000, calls: 30_000, dailyExtractCents: 400, monthlyExtractCents: 2000, examSittings: Infinity, write: true, exports: true },
  // $79/mo buys $65 of inference — ~4,400 pages a month across a hundred brains,
  // and enough calls for a room full of agents. Priced under the round hundred on
  // purpose: the ceilings that make this tier are mostly our CPU (brains, calls),
  // not tokens, so the margin can be wider without the number looking greedy.
  // It is one person's ceilings, deliberately: the seat is what studio sells, and
  // a tier that quietly included colleagues would leave nothing above it.
  team: { seats: 1, brains: 100, sources: 5000, calls: 150_000, dailyExtractCents: 1300, monthlyExtractCents: 6500, examSittings: Infinity, write: true, exports: true },
  // $249/mo, five seats. Priced against what it replaces rather than against the
  // tier below it: a studio that fails a submission loses weeks of a team, and
  // the brains this plan is bought for — approval, compliance, the RGS contract —
  // exist to stop exactly that. Per seat it is under $50, which is the number to
  // say out loud when $249 lands badly.
  //
  // The ceilings are shared, not multiplied: 300k calls is the studio's month,
  // not each colleague's, because calls.billed_to charges a member's call to the
  // studio (see 0073). $180 of inference inside a $249 price leaves $69 against
  // hosting, the embedder and the judge for five people — thinner than pro's
  // margin on purpose, since the seats are what is being sold.
  studio: { seats: 5, brains: 200, sources: 10_000, calls: 300_000, dailyExtractCents: 3600, monthlyExtractCents: 18_000, examSittings: Infinity, write: true, exports: true },
  // The operator's own account: the catalogue lives here, so the caps are
  // sized for seeding sessions, not for a customer. Not sold anywhere.
  admin: { seats: 100, brains: 10_000, sources: 100_000, calls: 1_000_000, dailyExtractCents: 100_000, monthlyExtractCents: 1_000_000, examSittings: Infinity, write: true, exports: true },
};

export function limitsFor(
  plan: Plan,
  paidUntil?: Date | string | null,
): PlanLimits {
  return PLANS[effectivePlan(plan, paidUntil)] ?? PLANS.free;
}

/** The plans that can be bought. */
export type PaidPlan = "pro" | "team" | "studio";

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
  // Five seats. See the limits above for why this is not team-times-three.
  studio: 24_900,
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
  if (plan !== "pro" && plan !== "team" && plan !== "studio") return plan;
  if (!paidUntil) return plan;
  return new Date(paidUntil).getTime() > now.getTime() ? plan : "free";
}
