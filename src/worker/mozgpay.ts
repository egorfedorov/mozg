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
  created_at: Date;
}

export interface MozgpayReport {
  matched: number;
  expired: number;
  seen: number;
}

// ─── chain readers ───────────────────────────────────────────────────────────

async function readTron(coin: Coin): Promise<Transfer[]> {
  const address = coin.address()!;
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

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

async function readEvm(coin: Coin): Promise<Transfer[]> {
  const address = coin.address()!;
  const rpc = async (method: string, params: unknown[]) => {
    const res = await fetch(env.MOZGPAY_ETH_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`eth rpc ${res.status}`);
    const body = (await res.json()) as { result?: unknown; error?: { message?: string } };
    if (body.error) throw new Error(`eth rpc: ${body.error.message}`);
    return body.result;
  };

  const latest = Number(await rpc("eth_blockNumber", []));
  // ~8 hours of blocks: invoices live 3h, and the window must outlive them.
  const fromBlock = `0x${Math.max(0, latest - 2400).toString(16)}`;
  const paddedTo = `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;

  const logs = (await rpc("eth_getLogs", [
    { fromBlock, toBlock: "latest", address: coin.contract, topics: [TRANSFER_TOPIC, null, paddedTo] },
  ])) as { transactionHash: string; logIndex: string; data: string; blockNumber: string }[];

  const out: Transfer[] = [];
  for (const log of logs.slice(-50)) {
    // A log in "latest" is ~1 confirmation. Count only once enough blocks sit
    // on top; a younger transfer just waits for the next watch tick.
    if (!confirmedAt(Number(log.blockNumber), latest, env.MOZGPAY_EVM_CONFIRMATIONS)) continue;
    const value = Number(BigInt(log.data)) / 10 ** coin.decimals;
    // One block-timestamp call per candidate is fine at these volumes.
    const block = (await rpc("eth_getBlockByNumber", [log.blockNumber, false])) as {
      timestamp: string;
    };
    out.push({
      txId: `${log.transactionHash}:${Number(log.logIndex)}`,
      amount: value.toFixed(coin.decimals),
      timestampMs: Number(block.timestamp) * 1000,
    });
  }
  return out;
}

async function readSol(coin: Coin): Promise<Transfer[]> {
  const address = coin.address()!;
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

async function readBtc(coin: Coin): Promise<Transfer[]> {
  const address = coin.address()!;
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

const READERS: Record<Coin["chain"], (coin: Coin) => Promise<Transfer[]>> = {
  tron: readTron,
  evm: readEvm,
  sol: readSol,
  btc: readBtc,
};

// ─── the watch ───────────────────────────────────────────────────────────────

export async function runMozgpayWatch(): Promise<MozgpayReport> {
  if (!mozgpayReady) return { matched: 0, expired: 0, seen: 0 };

  const exp = await query<{ id: string }>(
    `update topups set status = 'failed', settled_at = now()
      where provider = 'mozgpay' and status = 'pending' and expires_at < now()
      returning id`,
  );

  const open = await query<OpenInvoice>(
    `select reference, pay_amount::text, pay_coin, created_at from topups
      where provider = 'mozgpay' and status = 'pending'`,
  );
  if (!open.length) return { matched: 0, expired: exp.length, seen: 0 };

  const coinsInPlay = COINS.filter(
    (c) => c.address() && open.some((i) => i.pay_coin === c.key),
  );

  let matched = 0;
  let seen = 0;
  for (const coin of coinsInPlay) {
    let transfers: Transfer[];
    try {
      transfers = await READERS[coin.chain](coin);
    } catch (err) {
      // One explorer's bad minute — log and let the other chains work.
      console.warn(`[mozgpay] ${coin.key} read failed: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    seen += transfers.length;

    for (const tx of transfers) {
      const invoice = open.find(
        (i) =>
          i.pay_coin === coin.key &&
          // Amounts compare as text at the coin's own precision — the DB
          // column is wider (btc needs 8), so trailing zeros must not differ.
          Number(i.pay_amount).toFixed(coin.decimals) === tx.amount &&
          tx.timestampMs >= i.created_at.getTime(),
      );
      if (!invoice) continue;

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

  return { matched, expired: exp.length, seen };
}
