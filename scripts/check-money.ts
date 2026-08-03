/**
 * Does the money add up?
 *
 * The ledger is the source of truth and "user".balance_cents is a cache of its
 * sum. Any disagreement means a code path changed a balance without recording
 * why — the kind of bug that is invisible until someone disputes a number.
 *
 *   npm run check:money
 */
import { query } from "@/db";
import { formatCents, sellerShare } from "@/lib/money";

let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  console.log("\nbalances against the ledger:");

  const drift = await query<{ id: string; email: string; balance: number; summed: number }>(
    `select u.id, u.email, u.balance_cents as balance,
            coalesce((select sum(amount_cents) from ledger l where l.user_id = u.id), 0)::int as summed
       from "user" u
      where u.balance_cents <> coalesce(
        (select sum(amount_cents) from ledger l where l.user_id = u.id), 0)`,
  );
  check(
    "every balance equals the sum of its ledger",
    drift.length === 0,
    drift.length
      ? drift
          .map((d) => `${d.email}: balance ${formatCents(d.balance)} vs ledger ${formatCents(d.summed)}`)
          .join("; ")
      : "",
  );

  const negative = await query<{ email: string; balance_cents: number }>(
    `select email, balance_cents from "user" where balance_cents < 0`,
  );
  check("no balance is negative", negative.length === 0);

  console.log("\npurchases against the ledger:");

  // Every purchase must have written exactly two rows: the buyer's debit and
  // the author's earning.
  const orphans = await query<{ id: string; n: number }>(
    `select p.id, count(l.id)::int as n
       from purchases p left join ledger l on l.purchase_id = p.id
      group by p.id having count(l.id) <> 2`,
  );
  check("each purchase wrote exactly two ledger rows", orphans.length === 0,
    orphans.length ? `${orphans.length} with the wrong count` : "");

  const mismatched = await query<{ id: string; price: number; seller: number }>(
    `select id, price_cents as price, seller_cents as seller from purchases`,
  );
  const badSplit = mismatched.filter((p) => p.seller !== sellerShare(p.price));
  check("the author's share matches the fee", badSplit.length === 0,
    badSplit.length ? `${badSplit.length} purchase(s) off` : "");

  console.log("\ntotals:");
  const totals = await query<{ topups: number; purchases: number; earnings: number }>(
    `select
       coalesce(sum(amount_cents) filter (where kind = 'topup'), 0)::int as topups,
       coalesce(-sum(amount_cents) filter (where kind = 'purchase'), 0)::int as purchases,
       coalesce(sum(amount_cents) filter (where kind = 'earning'), 0)::int as earnings
     from ledger`,
  ).then((r) => r[0]);

  console.log(`  topped up:      ${formatCents(totals.topups)}`);
  console.log(`  spent:          ${formatCents(totals.purchases)}`);
  console.log(`  paid to authors:${formatCents(totals.earnings)}`);
  console.log(`  platform cut:   ${formatCents(totals.purchases - totals.earnings)}`);

  console.log(failures ? `\n✗ ${failures} check(s) FAILED\n` : "\n✓ the money adds up\n");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error("\n" + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
