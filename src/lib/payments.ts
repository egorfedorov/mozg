import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { maybeOne, query } from "@/db";
import { env } from "@/lib/env";
import { topUp } from "@/lib/money";

/**
 * Crypto top-ups through NOWPayments.
 *
 * Two rules make this safe, and both exist because a webhook is an
 * unauthenticated stranger:
 *
 *   1. The signature is verified before anything is read from the body.
 *   2. The credited amount comes from our own row, never from the callback.
 *      Even with a valid signature, trusting their numbers turns a provider
 *      bug or a replay into a balance nobody can explain.
 *
 * Idempotency is free: the ledger already refuses a second entry with the same
 * external reference, and our reference is unique per top-up.
 */

const API = "https://api.nowpayments.io/v1";

/** Wired up? Everything here is inert until both keys exist. */
export const paymentsReady = Boolean(env.NOWPAYMENTS_API_KEY && env.NOWPAYMENTS_IPN_SECRET);

/** Smallest useful top-up: below this the network fee is most of it. */
export const MIN_TOPUP_CENTS = 500;
export const MAX_TOPUP_CENTS = 100_000;

export interface Invoice {
  reference: string;
  payUrl: string;
  amountCents: number;
}

export async function createInvoice(opts: {
  userId: string;
  amountCents: number;
}): Promise<{ ok: true; invoice: Invoice } | { ok: false; reason: string }> {
  if (!paymentsReady) return { ok: false, reason: "unconfigured" };
  if (opts.amountCents < MIN_TOPUP_CENTS || opts.amountCents > MAX_TOPUP_CENTS) {
    return { ok: false, reason: "amount" };
  }

  const reference = `mozg_${randomBytes(12).toString("base64url")}`;

  // Recorded before the provider is contacted. If the call fails we are left
  // with a pending row and no invoice, which is inert; the opposite order
  // could leave a paid invoice with nothing to credit.
  await query(
    `insert into topups (user_id, amount_cents, provider, reference)
     values ($1, $2, 'nowpayments', $3)`,
    [opts.userId, opts.amountCents, reference],
  );

  const res = await fetch(`${API}/invoice`, {
    method: "POST",
    headers: {
      "x-api-key": env.NOWPAYMENTS_API_KEY!,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      price_amount: opts.amountCents / 100,
      price_currency: "usd",
      order_id: reference,
      order_description: "mozg balance top-up",
      ipn_callback_url: `${env.NEXT_PUBLIC_APP_URL}/api/payments/nowpayments`,
      success_url: `${env.NEXT_PUBLIC_APP_URL}/settings/balance`,
      cancel_url: `${env.NEXT_PUBLIC_APP_URL}/settings/balance`,
    }),
  });

  if (!res.ok) {
    await query(`update topups set status = 'failed' where reference = $1`, [reference]);
    return { ok: false, reason: `provider returned ${res.status}` };
  }

  const body = (await res.json()) as { id?: string | number; invoice_url?: string };
  if (!body.invoice_url) {
    await query(`update topups set status = 'failed' where reference = $1`, [reference]);
    return { ok: false, reason: "provider returned no payment link" };
  }

  await query(
    `update topups set provider_ref = $2, pay_url = $3 where reference = $1`,
    [reference, body.id ? String(body.id) : null, body.invoice_url],
  );

  return {
    ok: true,
    invoice: { reference, payUrl: body.invoice_url, amountCents: opts.amountCents },
  };
}

/**
 * NOWPayments signs the JSON body with HMAC-SHA512 over its keys sorted
 * alphabetically. Compared in constant time — a signature check that leaks
 * timing is a signature check an attacker can walk.
 */
export function validSignature(rawBody: string, header: string | null): boolean {
  if (!header || !env.NOWPAYMENTS_IPN_SECRET) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return false;
  }

  const sorted = JSON.stringify(parsed, Object.keys(parsed as object).sort());
  const expected = createHmac("sha512", env.NOWPAYMENTS_IPN_SECRET)
    .update(sorted)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(header, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type WebhookOutcome =
  | { credited: true; amountCents: number }
  | { credited: false; reason: "unknown" | "not-final" | "already" | "failed" };

/** Statuses that mean the money arrived and will not be reversed. */
const FINAL_OK = new Set(["finished", "confirmed"]);
const FINAL_BAD = new Set(["failed", "refunded", "expired"]);

export async function applyWebhook(payload: {
  order_id?: string;
  payment_status?: string;
  payment_id?: string | number;
}): Promise<WebhookOutcome> {
  const reference = String(payload.order_id ?? "");
  const status = String(payload.payment_status ?? "");
  if (!reference) return { credited: false, reason: "unknown" };

  const row = await maybeOne<{
    id: string;
    user_id: string;
    amount_cents: number;
    status: string;
  }>(`select id, user_id, amount_cents, status from topups where reference = $1`, [reference]);

  if (!row) return { credited: false, reason: "unknown" };
  if (row.status === "paid") return { credited: false, reason: "already" };

  if (FINAL_BAD.has(status)) {
    await query(
      `update topups set status = 'failed', settled_at = now() where id = $1`,
      [row.id],
    );
    return { credited: false, reason: "failed" };
  }

  // Anything else — waiting, confirming, partially_paid — is not money yet.
  if (!FINAL_OK.has(status)) return { credited: false, reason: "not-final" };

  await query(
    `update topups set status = 'paid', settled_at = now(), provider_ref = $2
      where id = $1`,
    [row.id, payload.payment_id ? String(payload.payment_id) : null],
  );

  // Our amount, not theirs. The ledger's unique external_ref makes a second
  // delivery of the same callback a no-op even if the row check above raced.
  await topUp({
    userId: row.user_id,
    amountCents: row.amount_cents,
    externalRef: reference,
    note: "crypto top-up",
  });

  return { credited: true, amountCents: row.amount_cents };
}

export async function recentTopups(userId: string, limit = 5) {
  return query<{
    reference: string;
    amount_cents: number;
    status: string;
    pay_url: string | null;
    created_at: string;
  }>(
    `select reference, amount_cents, status, pay_url,
            to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as created_at
       from topups where user_id = $1 order by created_at desc limit $2`,
    [userId, limit],
  );
}

/** Used by the check script to build a signed body the way the provider does. */
export function signForTest(body: object): string {
  const sorted = JSON.stringify(body, Object.keys(body).sort());
  return createHmac("sha512", env.NOWPAYMENTS_IPN_SECRET ?? "").update(sorted).digest("hex");
}
