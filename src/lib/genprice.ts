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

/**
 * What a balance can actually buy, in a sentence the agent can say out loud.
 *
 * A number of cents is not an answer to "can I do this". The user asking an
 * agent for art wants to hear "you have ten dollars, that is about ten
 * symbols" before anything is planned — not a balance they have to divide by a
 * price they were never told, and certainly not a refusal after the work.
 *
 * Deliberately approximate and says so: a set mixes roles at different prices,
 * so an exact count would be a promise about a set nobody has chosen yet.
 */
export function affordance(balanceCents: number, table: PriceTable): string {
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  const costs = Object.values(table).filter((c) => c > 0);
  const min = costs.length ? Math.min(...costs) : GENERATION_PRICE_CENTS;
  const max = costs.length ? Math.max(...costs) : GENERATION_PRICE_CENTS;

  if (balanceCents < min) {
    return (
      `Balance ${money(balanceCents)} — not enough for a single asset ` +
      `(the cheapest is ${money(min)}). Top up at https://mozg.sh/settings, or ` +
      `use your own key at https://apimart.ai/keys and generation stops costing ` +
      `balance at all.`
    );
  }

  const most = Math.floor(balanceCents / min);
  const fewest = Math.floor(balanceCents / max);
  const count =
    min === max || most === fewest
      ? `about ${most} asset${most === 1 ? "" : "s"} at ${money(min)} each`
      : `between ${fewest} and ${most} assets, depending on kind ` +
        `(${money(min)}–${money(max)} each)`;

  return `Balance ${money(balanceCents)} — enough for ${count}.`;
}
