import "../lib/test-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchInvoice } from "./mozgpay";
import { COINS } from "@/lib/mozgpay-chains";

/**
 * The rule that cost us the only real payment we ever took: an invoice for
 * 50.000000 USDT, settled on-chain 39 seconds later by a transfer of
 * 50.050000, matched nothing, expired, and had to be credited by hand.
 *
 * These fix both directions. Accepting too much is a hole — a big payment
 * must not settle a small invoice — and accepting too little is the bug above.
 */

const usdt = COINS.find((c) => c.key === "usdt-erc20")!;
const ADDR = "0xFbc06FE12219C631c0809A9F12c4F3E1C37Dc656";
const T0 = Date.UTC(2026, 7, 10, 11, 32, 32);

const invoice = (amount: string, over: Partial<{ reference: string; createdMs: number }> = {}) => ({
  reference: over.reference ?? `mzp_${amount}`,
  pay_amount: amount,
  pay_coin: usdt.key,
  pay_address: ADDR,
  created_at: new Date(over.createdMs ?? T0),
});

const paid = (amount: string, atMs = T0 + 39_000) => ({
  txId: `0xdeadbeef:${amount}`,
  amount,
  timestampMs: atMs,
});

test("the real payment: 50.05 settles an invoice for 50.00", () => {
  const open = [invoice("50.00000000")];
  assert.equal(matchInvoice(open, usdt, ADDR, paid("50.050000"))?.reference, "mzp_50.00000000");
});

test("paying exactly still works", () => {
  const open = [invoice("50.00000000")];
  assert.ok(matchInvoice(open, usdt, ADDR, paid("50.000000")));
});

test("underpaying settles nothing", () => {
  const open = [invoice("50.00000000")];
  assert.equal(matchInvoice(open, usdt, ADDR, paid("49.990000")), undefined);
});

test("a big payment does not settle a small invoice", () => {
  // The hole a naive "at least the asked amount" rule would open: $100 in,
  // and the $10 invoice closes while $90 goes missing.
  const open = [invoice("10.00000000")];
  assert.equal(matchInvoice(open, usdt, ADDR, paid("100.000000")), undefined);
});

test("when two invoices fit, the closest one is paid", () => {
  const open = [
    invoice("50.00000000", { reference: "far" }),
    invoice("50.04000000", { reference: "near" }),
  ];
  assert.equal(matchInvoice(open, usdt, ADDR, paid("50.050000"))?.reference, "near");
});

test("a transfer that landed before the invoice existed pays nothing", () => {
  // Otherwise an old deposit to the same wallet could be replayed into any
  // new invoice for the same amount.
  const open = [invoice("50.00000000")];
  assert.equal(matchInvoice(open, usdt, ADDR, paid("50.000000", T0 - 1000)), undefined);
});

test("an invoice on another address or coin is never touched", () => {
  const open = [invoice("50.00000000")];
  assert.equal(matchInvoice(open, usdt, "0xother", paid("50.000000")), undefined);
  const other = COINS.find((c) => c.key === "usdt-trc20")!;
  assert.equal(matchInvoice(open, other, ADDR, paid("50.000000")), undefined);
});
