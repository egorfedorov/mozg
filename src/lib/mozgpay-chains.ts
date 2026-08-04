import { env } from "@/lib/env";

/**
 * The coins mozgpay accepts, as data. Each entry knows its receiving address
 * (the owner's wallet — the server watches, it cannot spend), its decimal
 * precision, and how many USD one unit is worth: stables are 1:1 by fiat
 * (the peg's drift is smaller than anyone's patience for a price feed),
 * BTC is priced once at invoice creation and honoured for the invoice's
 * three-hour life — the drift risk is the seller's, chosen deliberately.
 */
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
    address: () => env.MOZGPAY_TRON_ADDRESS,
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
    address: () => env.MOZGPAY_ETH_ADDRESS,
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
    address: () => env.MOZGPAY_ETH_ADDRESS,
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
    address: () => env.MOZGPAY_SOL_ADDRESS,
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
    address: () => env.MOZGPAY_BTC_ADDRESS,
    note: "one confirmation, usually 10–40 minutes; the BTC amount is fixed when the invoice opens",
  },
];

export function coinByKey(key: string): Coin | null {
  const c = COINS.find((x) => x.key === key);
  return c && c.address() ? (c as Coin) : null;
}

export function availableCoins(): Coin[] {
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
