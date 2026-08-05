import "./test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyWebhook, canonicalJson, signForTest, validSignature } from "./payments";
import { stubDb } from "./test-db";

/** The historical canonicalization, kept here to prove byte-compatibility. */
const legacyCanonical = (body: object): string =>
  JSON.stringify(body, Object.keys(body).sort());

test("flat payload: canonicalJson is byte-identical to the legacy sorted-keys form", () => {
  // Shaped like a real NOWPayments callback: strings, numbers, a bool, null.
  const payload = {
    payment_status: "finished",
    order_id: "mozg_abc123",
    payment_id: 5522451814,
    pay_address: "TXyz...",
    price_amount: 25.5,
    price_currency: "usd",
    pay_amount: 0.00042,
    pay_currency: "btc",
    actually_paid: 0.00042,
    outcome_amount: 24.9,
    outcome_currency: "usd",
    parent_payment_id: null,
    fee_paid_by_user: false,
  };
  assert.equal(canonicalJson(payload), legacyCanonical(payload));
});

test("flat payload with an array value stays byte-identical too", () => {
  const payload = { order_id: "mozg_x", tags: ["a", "b", "c"], amounts: [1, 2.5, -3] };
  assert.equal(canonicalJson(payload), legacyCanonical(payload));
});

test("nested payload: nested keys are signed, so forging one breaks verification", () => {
  const body = {
    order_id: "mozg_abc123",
    payment_status: "finished",
    outcome: { amount: 100, currency: "usd" },
  };
  const signature = signForTest(body);
  assert.ok(validSignature(JSON.stringify(body), signature));

  const forged = { ...body, outcome: { amount: 1, currency: "usd" } };
  assert.equal(validSignature(JSON.stringify(forged), signature), false);

  // This is the hole the fix closes: the legacy replacer-array form dropped
  // the nested keys, so the forgery canonicalized to the same string.
  assert.equal(legacyCanonical(forged), legacyCanonical(body));
});

test("nested key order in the raw body does not matter", () => {
  const body = { order_id: "mozg_abc123", outcome: { amount: 100, currency: "usd" } };
  const signature = signForTest(body);
  // Same payload, keys written in a different order at both depths.
  const reordered = `{"outcome":{"currency":"usd","amount":100},"order_id":"mozg_abc123"}`;
  assert.ok(validSignature(reordered, signature));
});

test("a valid provider-style signature is accepted", () => {
  const body = { order_id: "mozg_abc123", payment_status: "finished", payment_id: 42 };
  assert.ok(validSignature(JSON.stringify(body), signForTest(body)));
});

test("a forged amount is rejected", () => {
  const body = { order_id: "mozg_abc123", payment_status: "finished", price_amount: 100 };
  const signature = signForTest(body);
  const forged = { ...body, price_amount: 1 };
  assert.equal(validSignature(JSON.stringify(forged), signature), false);
});

test("a wrong signature is rejected", () => {
  const body = { order_id: "mozg_abc123", payment_status: "finished" };
  const other = signForTest({ order_id: "mozg_someone-else", payment_status: "finished" });
  assert.equal(validSignature(JSON.stringify(body), other), false);
  assert.equal(validSignature(JSON.stringify(body), "0".repeat(128)), false);
});

test("missing header and malformed JSON are rejected", () => {
  assert.equal(validSignature("{}", null), false);
  assert.equal(validSignature("not json", "0".repeat(128)), false);
});

/** In-memory topups table + ledger, just enough for applyWebhook. */
function stubTopupsTable() {
  const topups = new Map<
    string,
    { id: string; user_id: string; amount_cents: number; status: string; purpose: string; buy_brain_id: string | null }
  >();
  const ledgerRefs = new Set<string>();
  let balance = 0;

  stubDb((text, params) => {
    if (/from topups where reference/.test(text)) {
      const row = topups.get(params[0] as string);
      return row ? [{ ...row }] : [];
    }
    if (/update topups set status = 'paid'/.test(text)) {
      const row = [...topups.values()].find((t) => t.id === params[0]);
      if (row) row.status = "paid";
      return [];
    }
    if (/update topups set status = 'failed'/.test(text)) {
      const row = [...topups.values()].find((t) => t.id === params[0]);
      if (row) row.status = "failed";
      return [];
    }
    if (/select 1 from ledger where external_ref/.test(text)) {
      return ledgerRefs.has(params[0] as string) ? [{ "?column?": 1 }] : [];
    }
    if (/update "user" set balance_cents/.test(text)) {
      balance += params[1] as number;
      return [{ balance_cents: balance }];
    }
    if (/select balance_cents from "user"/.test(text)) {
      return [{ balance_cents: balance }];
    }
    if (/insert into ledger/.test(text)) {
      ledgerRefs.add(params[5] as string);
      return [];
    }
    throw new Error(`unexpected query: ${text}`);
  });

  return { topups, balance: () => balance };
}

test("webhook: a finished payment credits our row's amount, not theirs", async () => {
  const db = stubTopupsTable();
  db.topups.set("mozg_r1", {
    id: "t1",
    user_id: "u1",
    amount_cents: 2500,
    status: "pending",
    purpose: "topup",
    buy_brain_id: null,
  });

  // The credited amount comes from our row; the payload's own numbers are
  // never read (the payload type does not even carry them).
  const outcome = await applyWebhook({
    order_id: "mozg_r1",
    payment_status: "finished",
    payment_id: 42,
  });
  assert.deepEqual(outcome, { credited: true, amountCents: 2500, userId: "u1" });
  assert.equal(db.balance(), 2500);
});

test("webhook: a replay of the same callback is a no-op", async () => {
  const db = stubTopupsTable();
  db.topups.set("mozg_r2", {
    id: "t2",
    user_id: "u1",
    amount_cents: 1000,
    status: "pending",
    purpose: "topup",
    buy_brain_id: null,
  });

  const payload = { order_id: "mozg_r2", payment_status: "finished", payment_id: 7 };
  const first = await applyWebhook(payload);
  assert.deepEqual(first, { credited: true, amountCents: 1000, userId: "u1" });

  const replay = await applyWebhook(payload);
  assert.deepEqual(replay, { credited: false, reason: "already" });
  assert.equal(db.balance(), 1000); // credited once, not twice
});

test("webhook: non-final statuses neither credit nor close the invoice", async () => {
  const db = stubTopupsTable();
  db.topups.set("mozg_r3", {
    id: "t3",
    user_id: "u1",
    amount_cents: 1000,
    status: "pending",
    purpose: "topup",
    buy_brain_id: null,
  });

  for (const status of ["waiting", "confirming", "partially_paid"]) {
    const outcome = await applyWebhook({ order_id: "mozg_r3", payment_status: status });
    assert.deepEqual(outcome, { credited: false, reason: "not-final" });
  }
  assert.equal(db.balance(), 0);

  // A later final status on the same invoice still credits.
  const final = await applyWebhook({ order_id: "mozg_r3", payment_status: "confirmed" });
  assert.deepEqual(final, { credited: true, amountCents: 1000, userId: "u1" });
});

test("webhook: failed payments close the invoice without crediting", async () => {
  const db = stubTopupsTable();
  db.topups.set("mozg_r4", {
    id: "t4",
    user_id: "u1",
    amount_cents: 1000,
    status: "pending",
    purpose: "topup",
    buy_brain_id: null,
  });

  const outcome = await applyWebhook({ order_id: "mozg_r4", payment_status: "failed" });
  assert.deepEqual(outcome, { credited: false, reason: "failed" });
  assert.equal(db.balance(), 0);
});

test("webhook: an unknown reference is refused", async () => {
  stubTopupsTable();
  const outcome = await applyWebhook({ order_id: "mozg_nope", payment_status: "finished" });
  assert.deepEqual(outcome, { credited: false, reason: "unknown" });
});
