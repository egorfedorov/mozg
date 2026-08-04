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
  write: boolean;
  exports: boolean;
}

export const PLANS: Record<Plan, PlanLimits> = {
  free: { brains: 1, sources: 50, calls: 300, dailyExtractCents: 300, write: false, exports: false },
  pro: { brains: 20, sources: 1000, calls: 10_000, dailyExtractCents: 3000, write: true, exports: true },
  team: { brains: 100, sources: 5000, calls: 50_000, dailyExtractCents: 10_000, write: true, exports: true },
  // The operator's own account: the catalogue lives here, so the caps are
  // sized for seeding sessions, not for a customer. Not sold anywhere.
  admin: { brains: 10_000, sources: 100_000, calls: 1_000_000, dailyExtractCents: 100_000, write: true, exports: true },
};

export function limitsFor(plan: Plan): PlanLimits {
  return PLANS[plan] ?? PLANS.free;
}
