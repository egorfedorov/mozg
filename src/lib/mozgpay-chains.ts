import { env } from "@/lib/env";
import { query } from "@/db";

/**
 * The coins mozgpay accepts, as data. Each entry knows its receiving address
 * (the owner's wallet — the server watches, it cannot spend), its decimal
 * precision, and how many USD one unit is worth: stables are 1:1 by fiat
 * (the peg's drift is smaller than anyone's patience for a price feed),
 * BTC is priced once at invoice creation and honoured for the invoice's
 * three-hour life — the drift risk is the seller's, chosen deliberately.
 *
 * Addresses resolve in two layers: an app_settings override the operator can
 * change from /admin, then the env var. The override cache refreshes lazily
 * with a short TTL, so a rotation reaches every process within a minute
 * without a restart. Open invoices are immune either way — they snapshot
 * their address at creation and are watched at that address.
 */

const OVERRIDE_KEYS = {
  tron: "mozgpay_addr_tron",
  eth: "mozgpay_addr_eth",
  sol: "mozgpay_addr_sol",
  btc: "mozgpay_addr_btc",
} as const;

let overrides: Partial<Record<keyof typeof OVERRIDE_KEYS, string>> = {};
let overridesAt = 0;

export async function loadPayAddresses(maxAgeMs = 60_000): Promise<void> {
  if (Date.now() - overridesAt < maxAgeMs) return;
  const rows = await query<{ key: string; value: string }>(
    `select key, value from app_settings where key = any($1::text[])`,
    [Object.values(OVERRIDE_KEYS)],
  );
  const next: typeof overrides = {};
  for (const [chain, key] of Object.entries(OVERRIDE_KEYS)) {
    const hit = rows.find((r) => r.key === key)?.value;
    if (hit) next[chain as keyof typeof OVERRIDE_KEYS] = hit;
  }
  overrides = next;
  overridesAt = Date.now();
}
export interface Coin {
  key: string;
  label: string;
  chain: "tron" | "evm" | "sol" | "btc";
  network: string;
  decimals: number;
  stable: boolean;
  address: () => string | undefined;
  /** Token contract / mint, where the chain needs one. */
  contract?: string;
  /** Human warning worth printing on the pay page. */
  note?: string;
}

export const COINS: Coin[] = [
  {
    key: "usdt-trc20",
    label: "USDT · TRON",
    chain: "tron",
    network: "TRC-20",
    decimals: 6,
    stable: true,
    address: () => overrides.tron ?? env.MOZGPAY_TRON_ADDRESS,
    contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    note: "cheapest fees, confirms in about a minute",
  },
  {
    key: "usdt-erc20",
    label: "USDT · Ethereum",
    chain: "evm",
    network: "ERC-20",
    decimals: 6,
    stable: true,
    address: () => overrides.eth ?? env.MOZGPAY_ETH_ADDRESS,
    contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    note: "Ethereum gas applies — a few dollars",
  },
  {
    key: "usdc-erc20",
    label: "USDC · Ethereum",
    chain: "evm",
    network: "ERC-20",
    decimals: 6,
    stable: true,
    address: () => overrides.eth ?? env.MOZGPAY_ETH_ADDRESS,
    contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    note: "Ethereum gas applies — a few dollars",
  },
  {
    key: "usdc-sol",
    label: "USDC · Solana",
    chain: "sol",
    network: "SPL",
    decimals: 6,
    stable: true,
    address: () => overrides.sol ?? env.MOZGPAY_SOL_ADDRESS,
    contract: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    note: "sub-cent fees, confirms in seconds",
  },
  {
    key: "btc",
    label: "BTC · Bitcoin",
    chain: "btc",
    network: "on-chain",
    decimals: 8,
    stable: false,
    address: () => overrides.btc ?? env.MOZGPAY_BTC_ADDRESS,
    note: "one confirmation, usually 10–40 minutes; the BTC amount is fixed when the invoice opens",
  },
];

export async function coinByKey(key: string): Promise<Coin | null> {
  await loadPayAddresses();
  const c = COINS.find((x) => x.key === key);
  return c && c.address() ? (c as Coin) : null;
}

export async function availableCoins(): Promise<Coin[]> {
  await loadPayAddresses();
  return COINS.filter((c) => c.address());
}

/** USD per one unit of the coin. Stables answer without a network. */
export async function usdPrice(coin: Coin): Promise<number> {
  if (coin.stable) return 1;
  // CoinGecko's public endpoint, no key. One call per BTC invoice.
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) throw new Error(`price feed answered ${res.status}`);
  const body = (await res.json()) as { bitcoin?: { usd?: number } };
  const price = body.bitcoin?.usd;
  if (!price || price <= 0) throw new Error("price feed returned no BTC price");
  return price;
}
