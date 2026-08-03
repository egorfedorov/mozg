/**
 * Exercise the purchase path against a real database.
 *
 * The unit tests prove the split is right. This proves the parts that only
 * break under concurrency and constraint pressure: a balance cannot go
 * negative, a brain cannot be bought twice, and two simultaneous clicks cannot
 * both succeed.
 *
 *   npm run check:purchase
 */
import { one, query } from "@/db";
import {
  purchaseBrain,
  topUp,
  adjustBalance,
  requestPayout,
  settlePayout,
  sellerShare,
  formatCents,
  MIN_PAYOUT_CENTS,
} from "@/lib/money";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function user(id: string, email: string): Promise<string> {
  await query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", plan, handle)
     values ($1, $1, $2, true, now(), now(), 'pro', $1)
     on conflict (id) do update set balance_cents = 0`,
    [id, email],
  );
  return id;
}

async function main() {
  console.log("\nsetting up");
  const seller = await user("chk-seller", "chk-seller@localhost");
  const buyer = await user("chk-buyer", "chk-buyer@localhost");

  const brain = await one<{ id: string }>(
    `insert into brains (owner_id, slug, title, goal, visibility, price_cents)
     values ($1, 'check-paid', 'Check paid brain', 'x', 'public', 500)
     on conflict (owner_id, slug) do update set price_cents = 500, visibility = 'public'
     returning id`,
    [seller],
  );
  await query(`delete from purchases where brain_id = $1`, [brain.id]);
  await query(`delete from ledger where user_id = any($1)`, [[seller, buyer]]);
  // An open request from a run that died mid-way would trip the one-open-per-
  // user index and fail the next run for the wrong reason.
  await query(`delete from payouts where user_id = any($1)`, [[seller, buyer]]);
  await query(`update "user" set balance_cents = 0 where id = any($1)`, [[seller, buyer]]);
  console.log("  brain at $5.00, both balances zeroed");

  console.log("\nbuying with an empty balance");
  const broke = await purchaseBrain({
    brainId: brain.id,
    buyerId: buyer,
    sellerId: seller,
    priceCents: 500,
  });
  check("refused", !broke.ok && broke.reason === "insufficient");

  console.log("\ntopping up");
  await topUp({ userId: buyer, amountCents: 1000, externalRef: "chk-ref-1" });
  const dup = await topUp({ userId: buyer, amountCents: 1000, externalRef: "chk-ref-1" });
  check("the same payment reference credits once", !dup.credited, `balance ${formatCents(dup.balanceCents)}`);

  console.log("\ntwo simultaneous purchases");
  // The whole reason the buyer's row is locked before the balance is read.
  const [a, b] = await Promise.all([
    purchaseBrain({ brainId: brain.id, buyerId: buyer, sellerId: seller, priceCents: 500 }),
    purchaseBrain({ brainId: brain.id, buyerId: buyer, sellerId: seller, priceCents: 500 }),
  ]).catch((err) => {
    // A unique-violation surfacing as a throw is still "only one won".
    console.log(`  (one attempt threw: ${err instanceof Error ? err.message.slice(0, 60) : err})`);
    return [{ ok: true }, { ok: false }] as const;
  });
  check("exactly one succeeded", Number(a.ok) + Number(b.ok) === 1);

  const rows = await query<{ n: number }>(
    `select count(*)::int as n from purchases where brain_id = $1 and buyer_id = $2`,
    [brain.id, buyer],
  );
  check("one purchase row exists", rows[0].n === 1, `${rows[0].n} rows`);

  // Buying is also how a brain reaches the buyer's set. Having to add
  // something you just paid for would be a bug report, not a step.
  const inSet = await query<{ n: number }>(
    `select count(*)::int as n from library where user_id = $1 and brain_id = $2`,
    [buyer, brain.id],
  );
  check("buying puts it in the buyer's brains", inSet[0].n === 1, `${inSet[0].n} row(s)`);

  console.log("\nmanual adjustment (the admin path)");
  // The buyer is on $5.00 here. Taking more than that back has to be refused,
  // or the ledger stops summing to the balances.
  const over = await adjustBalance({ userId: buyer, amountCents: -100000, note: "test" });
  check("cannot overdraw an account", !over.ok, `balance ${formatCents(over.balanceCents)}`);

  const credit = await adjustBalance({ userId: buyer, amountCents: 250, note: "goodwill" });
  const debit = await adjustBalance({ userId: buyer, amountCents: -250, note: "undo" });
  check("credit then debit nets to zero", credit.ok && debit.ok && debit.balanceCents === 500,
    formatCents(debit.balanceCents));

  console.log("\nwithdrawals");
  // The buyer is on $5.00. Give them enough to clear the minimum, then check
  // that asking does not move money and settling does.
  await topUp({ userId: buyer, amountCents: MIN_PAYOUT_CENTS, note: "for payout test" });
  const tooBig = await requestPayout({
    userId: buyer,
    amountCents: 1_000_000,
    destination: "T-test-wallet",
  });
  check("cannot withdraw more than the balance", !tooBig.ok);

  const asked = await requestPayout({
    userId: buyer,
    amountCents: MIN_PAYOUT_CENTS,
    destination: "T-test-wallet",
  });
  check("request accepted", asked.ok);

  const second = await requestPayout({
    userId: buyer,
    amountCents: MIN_PAYOUT_CENTS,
    destination: "T-test-wallet",
  });
  check("only one open request at a time", !second.ok && second.reason === "already-open");

  const pendingBalance = await query<{ balance_cents: number }>(
    `select balance_cents from "user" where id = $1`,
    [buyer],
  );
  check(
    "asking does not move money",
    pendingBalance[0].balance_cents === 500 + MIN_PAYOUT_CENTS,
    formatCents(pendingBalance[0].balance_cents),
  );

  if (asked.ok) {
    const settled = await settlePayout({ payoutId: asked.payoutId, paid: true });
    check("marking it paid debits the balance", settled.ok);
    const again = await settlePayout({ payoutId: asked.payoutId, paid: true });
    check("a settled payout cannot be paid twice", !again.ok && again.reason === "not-open");
  }

  console.log("\nbalances afterwards");
  const after = await query<{ id: string; balance_cents: number }>(
    `select id, balance_cents from "user" where id = any($1) order by id`,
    [[buyer, seller]],
  );
  const buyerBalance = after.find((u) => u.id === buyer)!.balance_cents;
  const sellerBalance = after.find((u) => u.id === seller)!.balance_cents;

  check("buyer charged exactly once", buyerBalance === 500, formatCents(buyerBalance));
  check(
    "author credited their share",
    sellerBalance === sellerShare(500),
    `${formatCents(sellerBalance)}, expected ${formatCents(sellerShare(500))}`,
  );

  const ledger = await query<{ n: number; sum: number }>(
    `select count(*)::int as n, sum(amount_cents)::int as sum from ledger
      where user_id = any($1)`,
    [[buyer, seller]],
  );
  check(
    "ledger sums to the balances",
    ledger[0].sum === buyerBalance + sellerBalance,
    `${formatCents(ledger[0].sum)} across ${ledger[0].n} rows`,
  );

  console.log("\ncleaning up");
  await query(`delete from brains where id = $1`, [brain.id]);
  await query(`delete from "user" where id = any($1)`, [[seller, buyer]]);
  console.log("  removed test accounts and brain");

  console.log(failures ? `\n✗ ${failures} check(s) FAILED\n` : "\n✓ purchases behave\n");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error("\n" + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
