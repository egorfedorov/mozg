import { tx } from "@/db";
import type { PoolClient } from "pg";
import { PLATFORM_FEE_PERCENT, sellerShare } from "@/lib/money-math";

/**
 * Money. Integer cents everywhere, ledger as the source of truth.
 *
 * Two rules the rest of the code depends on:
 *   1. Every balance change writes a ledger row in the same transaction.
 *   2. The payer's row is locked before their balance is read, so two
 *      concurrent purchases cannot both see enough money and both succeed.
 */

export { PLATFORM_FEE_PERCENT, formatCents, sellerShare } from "@/lib/money-math";

export type LedgerKind =
  | "topup"
  | "purchase"
  | "earning"
  | "payout"
  | "refund"
  | "adjustment";

interface MoveOptions {
  client: PoolClient;
  userId: string;
  amountCents: number;
  kind: LedgerKind;
  brainId?: string | null;
  purchaseId?: string | null;
  externalRef?: string | null;
  note?: string | null;
}

/**
 * Move money for one user and record it. Must run inside a transaction that
 * has already locked the row when the amount is negative.
 */
async function move(opts: MoveOptions): Promise<void> {
  const { client, userId, amountCents } = opts;
  if (amountCents === 0) throw new Error("refusing to record a zero movement");

  // The check constraint on the column is the real guard; this makes the
  // failure legible instead of a constraint violation from four calls away.
  const { rows } = await client.query<{ balance_cents: number }>(
    `update "user" set balance_cents = balance_cents + $2
      where id = $1 returning balance_cents`,
    [userId, amountCents],
  );
  if (!rows.length) throw new Error(`no such user: ${userId}`);

  await client.query(
    `insert into ledger
       (user_id, amount_cents, kind, brain_id, purchase_id, external_ref, note)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      userId,
      amountCents,
      opts.kind,
      opts.brainId ?? null,
      opts.purchaseId ?? null,
      opts.externalRef ?? null,
      opts.note ?? null,
    ],
  );
}

/**
 * Credit a balance. `externalRef` is the payment provider's id — the unique
 * index on it means a webhook delivered three times still credits once.
 */
export async function topUp(opts: {
  userId: string;
  amountCents: number;
  externalRef?: string;
  note?: string;
}): Promise<{ credited: boolean; balanceCents: number }> {
  if (opts.amountCents <= 0) throw new Error("top-up must be positive");

  return tx(async (client) => {
    if (opts.externalRef) {
      const seen = await client.query(
        `select 1 from ledger where external_ref = $1`,
        [opts.externalRef],
      );
      if (seen.rowCount) {
        const { rows } = await client.query<{ balance_cents: number }>(
          `select balance_cents from "user" where id = $1`,
          [opts.userId],
        );
        return { credited: false, balanceCents: rows[0]?.balance_cents ?? 0 };
      }
    }

    await move({
      client,
      userId: opts.userId,
      amountCents: opts.amountCents,
      kind: "topup",
      externalRef: opts.externalRef,
      note: opts.note,
    });

    const { rows } = await client.query<{ balance_cents: number }>(
      `select balance_cents from "user" where id = $1`,
      [opts.userId],
    );
    return { credited: true, balanceCents: rows[0].balance_cents };
  });
}

export type PurchaseResult =
  | { ok: true; purchaseId: string; paidCents: number; balanceCents: number }
  | { ok: false; reason: "already-owned" | "insufficient" | "free" | "own-brain" };

/**
 * Buy access to a brain. One transaction: lock the buyer, check the balance,
 * debit, credit the author, record the purchase.
 */
export async function purchaseBrain(opts: {
  brainId: string;
  buyerId: string;
  sellerId: string;
  priceCents: number;
}): Promise<PurchaseResult> {
  const { brainId, buyerId, sellerId, priceCents } = opts;

  if (priceCents <= 0) return { ok: false, reason: "free" };
  if (buyerId === sellerId) return { ok: false, reason: "own-brain" };

  return tx(async (client) => {
    // Lock first. Without this, two clicks a millisecond apart both read the
    // old balance and both pass the check.
    const locked = await client.query<{ balance_cents: number }>(
      `select balance_cents from "user" where id = $1 for update`,
      [buyerId],
    );
    if (!locked.rows.length) throw new Error(`no such user: ${buyerId}`);

    const owned = await client.query(
      `select 1 from purchases where brain_id = $1 and buyer_id = $2`,
      [brainId, buyerId],
    );
    if (owned.rowCount) return { ok: false as const, reason: "already-owned" as const };

    if (locked.rows[0].balance_cents < priceCents) {
      return { ok: false as const, reason: "insufficient" as const };
    }

    const sellerCents = sellerShare(priceCents);

    const { rows } = await client.query<{ id: string }>(
      `insert into purchases (brain_id, buyer_id, seller_id, price_cents, seller_cents)
       values ($1, $2, $3, $4, $5) returning id`,
      [brainId, buyerId, sellerId, priceCents, sellerCents],
    );
    const purchaseId = rows[0].id;

    await move({
      client,
      userId: buyerId,
      amountCents: -priceCents,
      kind: "purchase",
      brainId,
      purchaseId,
    });

    await move({
      client,
      userId: sellerId,
      amountCents: sellerCents,
      kind: "earning",
      brainId,
      purchaseId,
      note: `${PLATFORM_FEE_PERCENT}% platform fee`,
    });

    const after = await client.query<{ balance_cents: number }>(
      `select balance_cents from "user" where id = $1`,
      [buyerId],
    );

    return {
      ok: true as const,
      purchaseId,
      paidCents: priceCents,
      balanceCents: after.rows[0].balance_cents,
    };
  });
}
