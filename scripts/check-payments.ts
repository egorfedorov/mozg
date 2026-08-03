/**
 * Prove the top-up webhook cannot be talked into crediting money it should not.
 *
 *   npm run check:payments
 *
 * Runs against the database directly, with a stubbed secret supplied by the
 * npm script, so it needs no provider account. The keys are set there rather
 * than here because imports are hoisted: assigning process.env at the top of
 * this file still runs after lib/env.ts has already read it.
 *
 * The provider call itself is not exercised — what matters is everything after
 * the callback arrives, which is where the money is.
 */
import { one, query, maybeOne } from "@/db";
import { applyWebhook, validSignature, signForTest } from "@/lib/payments";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function balanceOf(id: string): Promise<number> {
  const row = await maybeOne<{ balance_cents: number }>(
    `select balance_cents from "user" where id = $1`,
    [id],
  );
  return row?.balance_cents ?? 0;
}

async function main() {
  console.log("\nsetting up");
  await query(`delete from "user" where id = 'pay-probe'`);
  const user = await one<{ id: string }>(
    `insert into "user" (id,name,email,"emailVerified","createdAt","updatedAt",plan,handle)
     values ('pay-probe','Pay','pay-probe@localhost',true,now(),now(),'pro','pay-probe')
     returning id`,
  );

  const reference = "mozg_test_ref";
  await query(
    `insert into topups (user_id, amount_cents, provider, reference)
     values ($1, 1000, 'nowpayments', $2)`,
    [user.id, reference],
  );
  console.log("  a $10.00 top-up, pending");

  console.log("\nsignatures");
  const body = { order_id: reference, payment_status: "finished", payment_id: 42 };
  const raw = JSON.stringify(body);
  check("a correct signature is accepted", validSignature(raw, signForTest(body)));
  check("a wrong signature is refused", !validSignature(raw, "deadbeef"));
  check("a missing signature is refused", !validSignature(raw, null));
  check(
    "a tampered body is refused",
    !validSignature(JSON.stringify({ ...body, payment_status: "x" }), signForTest(body)),
  );

  console.log("\nstatuses that are not money yet");
  for (const status of ["waiting", "confirming", "partially_paid", "sending"]) {
    const out = await applyWebhook({ order_id: reference, payment_status: status });
    check(`${status} credits nothing`, !out.credited, out.credited ? "CREDITED" : out.reason);
  }
  check("balance untouched", (await balanceOf(user.id)) === 0, `${await balanceOf(user.id)}c`);

  console.log("\nthe payment lands");
  const paid = await applyWebhook(body);
  check("finished credits the balance", paid.credited);
  check("the amount is ours, not theirs", (await balanceOf(user.id)) === 1000,
    `${await balanceOf(user.id)}c`);

  console.log("\nthe same callback again");
  const again = await applyWebhook(body);
  check("a replay credits nothing", !again.credited, again.credited ? "CREDITED" : again.reason);
  check("balance still $10.00", (await balanceOf(user.id)) === 1000,
    `${await balanceOf(user.id)}c`);

  // The whole reason the amount comes from our row: a valid signature over a
  // body claiming a bigger payment must not move a bigger number.
  console.log("\na callback claiming a different amount");
  await query(
    `insert into topups (user_id, amount_cents, provider, reference)
     values ($1, 500, 'nowpayments', 'mozg_test_ref2')`,
    [user.id],
  );
  await applyWebhook({
    order_id: "mozg_test_ref2",
    payment_status: "finished",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...({ price_amount: 999999, actually_paid: 999999 } as any),
  });
  check(
    "only the recorded amount is credited",
    (await balanceOf(user.id)) === 1500,
    `${await balanceOf(user.id)}c, expected 1500c`,
  );

  console.log("\nan order we never created");
  const unknown = await applyWebhook({ order_id: "mozg_not_ours", payment_status: "finished" });
  check("is refused", !unknown.credited && unknown.reason === "unknown");

  console.log("\nthe ledger still reconciles");
  const led = await query<{ sum: number }>(
    `select coalesce(sum(amount_cents),0)::int as sum from ledger where user_id = $1`,
    [user.id],
  );
  check("ledger equals the balance", led[0].sum === (await balanceOf(user.id)),
    `${led[0].sum}c`);

  await query(`delete from "user" where id = 'pay-probe'`);
  console.log(failures ? `\n✗ ${failures} check(s) FAILED\n` : "\n✓ top-ups behave\n");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error("\n" + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
