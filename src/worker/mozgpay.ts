import { query } from "@/db";
import { env } from "@/lib/env";
import { confirmedAt } from "@/lib/confirmations";
import { mozgpayReady, settleOwnInvoice, completeFollowUp } from "@/lib/payments";
import { COINS, type Coin } from "@/lib/mozgpay-chains";

/**
 * The watcher: reads confirmed transfers into the owner's addresses and
 * matches them to open invoices by coin and amount.
 *
 * Trust order: the chain is the source of truth, our row is the authority on
 * what a payment means, and a transfer may only pay an invoice that was
 * ALREADY OPEN when the transfer confirmed. Every chain reader is isolated —
 * one explorer having a bad minute must not stop the others.
 */

interface Transfer {
  txId: string;
  amount: string; // fixed to the coin's decimals
  timestampMs: number;
}

interface OpenInvoice {
  reference: string;
  pay_amount: string;
  pay_coin: string;
  pay_address: string;
  created_at: Date;
}

export interface MozgpayReport {
  matched: number;
  expired: number;
  seen: number;
  /** Transfers into our address that no open invoice claimed. */
  unmatched: number;
}

/**
 * How much over the asking price still counts as paying it.
 *
 * Two percent covers the rounding an exchange does and the margin a careful
 * payer adds, and stays well under the gap between any two invoice amounts a
 * person would plausibly pick. It is a ceiling rather than a licence: the
 * closest fitting invoice is the one that gets paid.
 */
const OVERPAY_TOLERANCE = 0.02;

// ─── chain readers ───────────────────────────────────────────────────────────

async function readTron(coin: Coin, address: string): Promise<Transfer[]> {
  const headers: Record<string, string> = env.TRONGRID_API_KEY
    ? { "TRON-PRO-API-KEY": env.TRONGRID_API_KEY }
    : {};
  const res = await fetch(
    `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20` +
      `?only_confirmed=true&only_to=true&limit=100&contract_address=${coin.contract}`,
    { headers, signal: AbortSignal.timeout(20_000) },
  );
  if (!res.ok) throw new Error(`trongrid ${res.status}`);
  const body = (await res.json()) as {
    data?: { transaction_id: string; to: string; value: string; block_timestamp: number; token_info?: { decimals?: number } }[];
  };

  // The solidity node reports the newest solidified block — Tron's own
  // finality line, reached ~19 SR confirmations after inclusion.
  const solidRes = await fetch("https://api.trongrid.io/walletsolidity/getnowblock", {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(20_000),
  });
  if (!solidRes.ok) throw new Error(`trongrid solidity ${solidRes.status}`);
  const solid = (await solidRes.json()) as { block_header?: { raw_data?: { number?: number } } };
  const solidTip = solid.block_header?.raw_data?.number ?? 0;

  const out: Transfer[] = [];
  for (const t of (body.data ?? []).filter((t) => t.to === address).slice(0, 50)) {
    // The list's only_confirmed filter is TronGrid's word for "in a solid
    // block", but the list carries no height — ask the solidity node so the
    // depth rule has a real block number to count from.
    const infoRes = await fetch("https://api.trongrid.io/walletsolidity/gettransactioninfobyid", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ value: t.transaction_id }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!infoRes.ok) throw new Error(`trongrid solidity ${infoRes.status}`);
    const info = (await infoRes.json()) as { blockNumber?: number };
    // Not in a solid block yet, or not deep enough past it — the invoice
    // stays pending and the next watch tick looks again.
    if (!info.blockNumber) continue;
    if (!confirmedAt(info.blockNumber, solidTip, env.MOZGPAY_TRON_CONFIRMATIONS)) continue;
    out.push({
      txId: t.transaction_id,
      amount: (Number(t.value) / 10 ** (t.token_info?.decimals ?? coin.decimals)).toFixed(coin.decimals),
      timestampMs: t.block_timestamp,
    });
  }
  return out;
}

/**
 * ERC-20 transfers in, read from a public explorer rather than an RPC node.
 *
 * This used to scan `eth_getLogs` over the last ~2400 blocks through
 * MOZGPAY_ETH_RPC, whose default was https://eth.llamarpc.com. That host now
 * answers 521 — and the failure was invisible, because the caller catches a
 * reader's error, warns, and moves to the next chain. So ERC-20 invoices were
 * never checked at all, silently, and the one real customer who paid had to be
 * credited by hand.
 *
 * Swapping the URL does not fix it: every free node tested refuses a log range
 * wide enough for a day of invoices — publicnode 403s, 1rpc caps at 50 blocks,
 * ankr wants a key, cloudflare rate-limits. An address-indexed explorer answers
 * the question we actually have ("what arrived at this address") in one call,
 * with no range limit and no key, which is the same reason readBtc uses
 * mempool.space.
 */
async function readEvm(coin: Coin, address: string): Promise<Transfer[]> {
  const get = async (path: string) => {
    const res = await fetch(`${env.MOZGPAY_ETH_EXPLORER}${path}`, {
      signal: AbortSignal.timeout(20_000),
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`explorer ${res.status}`);
    return res.json();
  };

  const [transfers, blocks] = await Promise.all([
    get(`/api/v2/addresses/${address}/token-transfers?type=ERC-20`) as Promise<{
      items?: {
        transaction_hash?: string;
        log_index?: number;
        block_number?: number;
        timestamp?: string;
        token?: { address_hash?: string; address?: string };
        total?: { value?: string; decimals?: string };
        to?: { hash?: string };
      }[];
    }>,
    get(`/api/v2/blocks?type=block`) as Promise<{ items?: { height?: number }[] }>,
  ]);

  const tip = blocks.items?.[0]?.height ?? 0;
  const want = coin.contract?.toLowerCase();

  const out: Transfer[] = [];
  for (const t of (transfers.items ?? []).slice(0, 50)) {
    const token = (t.token?.address_hash ?? t.token?.address ?? "").toLowerCase();
    if (want && token !== want) continue;
    if ((t.to?.hash ?? "").toLowerCase() !== address.toLowerCase()) continue;
    if (t.block_number == null || !t.timestamp || !t.transaction_hash) continue;
    // Same depth rule as every other chain here: an explorer lists a transfer
    // the moment it is in a block, and a block can still be reorganised out.
    if (!confirmedAt(t.block_number, tip, env.MOZGPAY_EVM_CONFIRMATIONS)) continue;

    const decimals = Number(t.total?.decimals ?? coin.decimals);
    const value = Number(t.total?.value ?? 0) / 10 ** decimals;
    if (!(value > 0)) continue;

    out.push({
      txId: `${t.transaction_hash}:${t.log_index ?? 0}`,
      amount: value.toFixed(coin.decimals),
      timestampMs: Date.parse(t.timestamp),
    });
  }
  return out;
}

async function readSol(coin: Coin, address: string): Promise<Transfer[]> {
  const rpc = async (method: string, params: unknown[]) => {
    const res = await fetch("https://api.mainnet-beta.solana.com", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`sol rpc ${res.status}`);
    const body = (await res.json()) as { result?: unknown; error?: { message?: string } };
    if (body.error) throw new Error(`sol rpc: ${body.error.message}`);
    return body.result;
  };

  // Finalized is Solana's irreversible commitment; the slot-depth rule below
  // then counts slots on top of the one carrying the transfer.
  const sigs = (await rpc("getSignaturesForAddress", [address, { limit: 25, commitment: "finalized" }])) as {
    signature: string;
    blockTime: number | null;
    err: unknown;
  }[];

  const tipSlot = Number(await rpc("getSlot", [{ commitment: "finalized" }]));

  const out: Transfer[] = [];
  for (const s of sigs) {
    if (s.err || !s.blockTime) continue;
    const tx = (await rpc("getTransaction", [
      s.signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "finalized" },
    ])) as {
      slot?: number;
      meta?: {
        preTokenBalances?: { owner?: string; mint?: string; uiTokenAmount?: { amount?: string } }[];
        postTokenBalances?: { owner?: string; mint?: string; uiTokenAmount?: { amount?: string } }[];
      };
    } | null;
    if (!tx?.meta || tx.slot == null) continue;
    if (!confirmedAt(tx.slot, tipSlot, env.MOZGPAY_SOL_CONFIRMATIONS)) continue;

    const balFor = (list?: { owner?: string; mint?: string; uiTokenAmount?: { amount?: string } }[]) =>
      list?.find((b) => b.owner === address && b.mint === coin.contract)?.uiTokenAmount?.amount ?? "0";
    const delta = Number(balFor(tx.meta.postTokenBalances)) - Number(balFor(tx.meta.preTokenBalances));
    if (delta <= 0) continue;

    out.push({
      txId: s.signature,
      amount: (delta / 10 ** coin.decimals).toFixed(coin.decimals),
      timestampMs: s.blockTime * 1000,
    });
  }
  return out;
}

async function readBtc(coin: Coin, address: string): Promise<Transfer[]> {
  const [res, tipRes] = await Promise.all([
    fetch(`https://mempool.space/api/address/${address}/txs`, {
      signal: AbortSignal.timeout(20_000),
    }),
    fetch("https://mempool.space/api/blocks/tip/height", {
      signal: AbortSignal.timeout(20_000),
    }),
  ]);
  if (!res.ok) throw new Error(`mempool.space ${res.status}`);
  if (!tipRes.ok) throw new Error(`mempool.space tip ${tipRes.status}`);
  const tip = Number(await tipRes.text());
  const txs = (await res.json()) as {
    txid: string;
    status: { confirmed: boolean; block_time?: number; block_height?: number };
    vout: { scriptpubkey_address?: string; value: number }[];
  }[];

  return txs
    // confirmed is 1 block; count only once the tx sits deep enough under
    // the tip. A shallower one stays pending for the next watch tick.
    .filter(
      (t) =>
        t.status.confirmed &&
        t.status.block_time &&
        t.status.block_height != null &&
        confirmedAt(t.status.block_height, tip, env.MOZGPAY_BTC_CONFIRMATIONS),
    )
    .map((t) => ({
      txId: t.txid,
      amount: (
        t.vout
          .filter((v) => v.scriptpubkey_address === address)
          .reduce((n, v) => n + v.value, 0) / 1e8
      ).toFixed(coin.decimals),
      timestampMs: t.status.block_time! * 1000,
    }))
    .filter((t) => Number(t.amount) > 0);
}

const READERS: Record<Coin["chain"], (coin: Coin, address: string) => Promise<Transfer[]>> = {
  tron: readTron,
  evm: readEvm,
  sol: readSol,
  btc: readBtc,
};

// ─── the watch ───────────────────────────────────────────────────────────────

export async function runMozgpayWatch(): Promise<MozgpayReport> {
  if (!mozgpayReady) return { matched: 0, expired: 0, seen: 0, unmatched: 0 };

  // The search runs BEFORE anything is written off, and that order is the
  // whole point. Expiring first meant an invoice that ran out of time five
  // minutes ago was already 'failed' by the time this pass looked at the
  // chain, so a payment arriving near the deadline could never be matched —
  // not on this pass, and not on any later one, because later passes only
  // read pending rows.
  const open = await query<OpenInvoice>(
    `select reference, pay_amount::text, pay_coin, pay_address, created_at from topups
      where provider = 'mozgpay' and status = 'pending'`,
  );
  if (!open.length) {
    return { matched: 0, expired: (await expireOverdue()).length, seen: 0, unmatched: 0 };
  }

  // Watch every address an open invoice was issued with — not the current
  // configured address. The operator may rotate wallets while an invoice is
  // pending, and the payer is sending to the address printed on their page.
  const watch = new Map<string, { coin: Coin; address: string }>();
  for (const i of open) {
    const coin = COINS.find((c) => c.key === i.pay_coin);
    if (coin && i.pay_address) {
      watch.set(`${coin.key}:${i.pay_address}`, { coin, address: i.pay_address });
    }
  }

  let matched = 0;
  let seen = 0;
  let unmatched = 0;
  for (const { coin, address } of watch.values()) {
    let transfers: Transfer[];
    try {
      transfers = await READERS[coin.chain](coin, address);
    } catch (err) {
      // One explorer's bad minute — log and let the other chains work.
      console.warn(`[mozgpay] ${coin.key} read failed: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    seen += transfers.length;

    for (const tx of transfers) {
      const invoice = matchInvoice(open, coin, address, tx);
      if (!invoice) {
        // Money arrived at our address and paid nothing. Almost always a
        // payment we should have taken, so it is said out loud rather than
        // dropped — the alternative is finding out during an audit.
        unmatched++;
        console.warn(
          `[mozgpay] unmatched ${tx.amount} ${coin.label} at ${address} ` +
            `(${tx.txId.slice(0, 14)}…) — no open invoice fits`,
        );
        continue;
      }

      const used = await query(
        `select 1 from topups where provider_ref = $1 and provider = 'mozgpay'`,
        [tx.txId],
      );
      if (used.length) continue;

      const outcome = await settleOwnInvoice(invoice.reference, tx.txId);
      if (outcome.credited) {
        matched++;
        console.log(
          `[mozgpay] ${invoice.reference} paid: ${tx.amount} ${coin.label} (${tx.txId.slice(0, 12)}…)`,
        );
        await completeFollowUp(outcome);
      }
    }
  }

  // Only now: whatever is still pending and out of time is written off.
  return { matched, expired: (await expireOverdue()).length, seen, unmatched };
}

async function expireOverdue() {
  return query<{ id: string }>(
    `update topups set status = 'failed', settled_at = now()
      where provider = 'mozgpay' and status = 'pending' and expires_at < now()
      returning id`,
  );
}

/**
 * Which open invoice, if any, this transfer pays.
 *
 * Exact equality was the rule, and it cost us the only real payment we ever
 * took: an invoice for 50.000000 USDT was settled on-chain by a transfer of
 * 50.050000, which did not match, expired, and was credited by hand an hour
 * later. Overpaying is not an edge case — exchanges round, wallets add a
 * margin, and nobody hits the sixth decimal on purpose.
 *
 * So a transfer pays an invoice when it covers it and does not wildly exceed
 * it, and when two invoices both fit, the closest one wins. Underpayment is
 * still refused: crediting a full invoice for part of its money is a hole,
 * and the operator can settle it by hand from the admin page.
 */
export function matchInvoice(
  open: OpenInvoice[],
  coin: Coin,
  address: string,
  tx: Transfer,
): OpenInvoice | undefined {
  const paid = Number(tx.amount);
  let best: { invoice: OpenInvoice; over: number } | undefined;

  for (const i of open) {
    if (i.pay_coin !== coin.key || i.pay_address !== address) continue;
    if (tx.timestampMs < i.created_at.getTime()) continue;
    const want = Number(i.pay_amount);
    if (!(want > 0)) continue;
    const over = paid - want;
    if (over < 0 || over > want * OVERPAY_TOLERANCE) continue;
    if (!best || over < best.over) best = { invoice: i, over };
  }

  return best?.invoice;
}
