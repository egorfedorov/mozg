import { NextResponse } from "next/server";
import { validSignature, applyWebhook, paymentsReady } from "@/lib/payments";

export const dynamic = "force-dynamic";

/**
 * Payment callback.
 *
 * The body is read as raw text and the signature checked before a single field
 * is trusted — this endpoint is reachable by anyone who can guess the URL, and
 * everything it does moves money.
 *
 * Always answers 200 once the signature is valid, whatever the outcome:
 * providers retry non-2xx for hours, and "this order is already paid" is not a
 * failure worth being retried at.
 */
export async function POST(req: Request) {
  if (!paymentsReady) {
    return NextResponse.json({ error: "payments are not configured" }, { status: 503 });
  }

  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-nowpayments-sig"))) {
    console.warn("[payments] rejected a callback with a bad signature");
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  const outcome = await applyWebhook(payload);
  console.log(
    `[payments] ${String(payload.order_id)} ${String(payload.payment_status)} — ` +
      (outcome.credited ? `credited ${outcome.amountCents}c` : outcome.reason),
  );

  return NextResponse.json({ ok: true });
}
