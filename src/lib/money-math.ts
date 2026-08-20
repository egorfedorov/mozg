/**
 * Money arithmetic. Integer cents only — no floats anywhere near a price.
 *
 * Separate from money.ts so it carries no database import: this is the part
 * worth testing exhaustively, and a unit test for a split should not need a
 * connection string.
 */

/** The platform's share of a sale, in percent. */
export const PLATFORM_FEE_PERCENT = 5;

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * The author's cut of a sale.
 *
 * The fee is floored, so a fraction of a cent stays with the author rather
 * than with us. At $0.01 the fee rounds to nothing and they keep the penny —
 * which is the right direction for an error nobody can audit.
 */
export function sellerShare(priceCents: number): number {
  return priceCents - Math.floor((priceCents * PLATFORM_FEE_PERCENT) / 100);
}

/** The affiliate's share of every plan payment their referral makes. */
export const REFERRAL_PERCENT = 20;

/**
 * The commission on one plan payment — see lib/referral.ts for the programme.
 *
 * Floored, so a fraction of a cent is never conjured. It only bites on an odd
 * promo price: both plans and the founding half-price divide by five exactly.
 * Computed from what was actually charged, never from the list price, which is
 * why it takes an amount rather than a plan.
 */
export function commissionCents(paidCents: number): number {
  if (paidCents <= 0) return 0;
  return Math.floor((paidCents * REFERRAL_PERCENT) / 100);
}
