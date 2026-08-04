import { query } from "@/db";
import { env } from "@/lib/env";
import { mozgpayReady, settleOwnInvoice, completeFollowUp } from "@/lib/payments";

/**
 * The watcher: reads USDT (TRC-20) transfers into the owner's address and
 * matches them to open invoices by their amount fingerprint.
 *
 * Trust order matters here: the chain is the source of truth, our row is the
 * authority on what a payment means, and the transfer is matched only to an
 * invoice that was ALREADY OPEN when the transfer confirmed — an old
 * transfer must never pay a future invoice that happens to reuse its amount.
 */

/** Mainnet USDT TRC-20 contract — the one constant everyone verifies twice. */
const USDT_TRC20 = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

interface Trc20Tx {
  transaction_id: string;
  to: string;
  value: string;
  block_timestamp: number;
  token_info?: { address?: string; decimals?: number };
}

export interface MozgpayReport {
  matched: number;
  expired: number;
  seen: number;
}

export async function runMozgpayWatch(): Promise<MozgpayReport> {
  if (!mozgpayReady) return { matched: 0, expired: 0, seen: 0 };
  const address = env.MOZGPAY_TRON_ADDRESS!;

  // Housekeeping first: an invoice nobody paid for three hours is dead, and
  // freeing its fingerprint is what lets the amounts stay short.
  const exp = await query<{ id: string }>(
    `update topups set status = 'failed', settled_at = now()
      where provider = 'mozgpay' and status = 'pending' and expires_at < now()
      returning id`,
  );

  // Nothing open — don't spend a TronGrid request.
  const open = await query<{ reference: string; pay_amount: string; created_at: Date }>(
    `select reference, pay_amount::text, created_at from topups
      where provider = 'mozgpay' and status = 'pending'`,
  );
  if (!open.length) return { matched: 0, expired: exp.length, seen: 0 };

  const res = await fetch(
    `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20` +
      `?only_confirmed=true&only_to=true&limit=100&contract_address=${USDT_TRC20}`,
    {
      headers: env.TRONGRID_API_KEY ? { "TRON-PRO-API-KEY": env.TRONGRID_API_KEY } : {},
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!res.ok) throw new Error(`trongrid answered ${res.status}`);
  const body = (await res.json()) as { data?: Trc20Tx[] };
  const txs = body.data ?? [];

  let matched = 0;
  for (const tx of txs) {
    if (tx.to !== address) continue;
    const decimals = tx.token_info?.decimals ?? 6;
    const amount = (Number(tx.value) / 10 ** decimals).toFixed(6);

    const invoice = open.find(
      (i) =>
        i.pay_amount === amount &&
        // Only transfers that happened after the invoice opened may pay it.
        tx.block_timestamp >= i.created_at.getTime(),
    );
    if (!invoice) continue;

    // A transfer settles at most one invoice, ever — the ledger's unique
    // reference and the pending-check inside settle make replays no-ops,
    // and this guard stops one tx from matching a second same-amount
    // invoice in a later pass.
    const used = await query(
      `select 1 from topups where provider_ref = $1 and provider = 'mozgpay'`,
      [tx.transaction_id],
    );
    if (used.length) continue;

    const outcome = await settleOwnInvoice(invoice.reference, tx.transaction_id);
    if (outcome.credited) {
      matched++;
      console.log(
        `[mozgpay] ${invoice.reference} paid by ${tx.transaction_id.slice(0, 12)}… ` +
          `(${amount} USDT)`,
      );
      await completeFollowUp(outcome);
    }
  }

  return { matched, expired: exp.length, seen: txs.length };
}
