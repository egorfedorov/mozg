import { query } from "@/db";
import { GENERATION_PRICE_CENTS } from "@/lib/generate";
import { ROLES, type AssetRole } from "@/lib/slotgen";

/**
 * What each kind of asset costs, read from the database.
 *
 * A price that lives in a constant is a price only a deploy can change, which
 * means it is never tried against a real customer — the first number somebody
 * typed becomes the number forever. These rows are editable in the operator's
 * own screen, and a role with no row falls back to the gallery's single price
 * rather than refusing to generate: a missing setting must never be the reason
 * a studio cannot buy anything.
 */

export type PriceTable = Record<string, number>;

export async function prices(): Promise<PriceTable> {
  const rows = await query<{ role: string; cents: number }>(
    `select role, cents from gen_prices`,
  ).catch(() => []);

  const table: PriceTable = {};
  for (const role of Object.keys(ROLES)) table[role] = GENERATION_PRICE_CENTS;
  for (const row of rows) table[row.role] = row.cents;
  return table;
}

/** The price of one asset, given a table already read. Kept separate so a pack
 *  of thirteen prices itself with one query rather than thirteen. */
export function priceOf(table: PriceTable, role: string): number {
  return table[role] ?? GENERATION_PRICE_CENTS;
}

export async function setPrice(role: string, cents: number): Promise<void> {
  if (!(role in ROLES)) throw new Error(`unknown role ${role}`);
  if (!Number.isInteger(cents) || cents < 0 || cents > 100_000) {
    throw new Error("a price must be a whole number of cents, and sane");
  }
  await query(
    `insert into gen_prices (role, cents) values ($1, $2)
     on conflict (role) do update set cents = excluded.cents, updated_at = now()`,
    [role, cents],
  );
}

/** Roles in the order an operator wants to see them: what a set is mostly made
 *  of first, the incidentals after. */
export function priceRows(table: PriceTable): { role: AssetRole; cents: number; summary: string }[] {
  return (Object.keys(ROLES) as AssetRole[]).map((role) => ({
    role,
    cents: priceOf(table, role),
    summary: ROLES[role].summary,
  }));
}
