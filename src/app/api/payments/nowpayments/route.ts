import { NextResponse } from "next/server";
import { validSignature, applyWebhook, paymentsReady } from "@/lib/payments";
import { purchaseBrain } from "@/lib/money";
import { maybeOne } from "@/db";

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

  // Direct checkout: the money just landed as balance; now spend it on the
  // brain the invoice was for. After the credit's transaction on purpose —
  // both lock the balance row, and nesting them would deadlock. If this step
  // fails (price changed, brain gone), the money stays as balance: degraded,
  // never lost, and the log says exactly what happened.
  if (outcome.credited && outcome.followUp) {
    const { userId, buyBrainId } = outcome.followUp;
    const brain = await maybeOne<{ owner_id: string }>(
      `select owner_id from brains where id = $1`,
      [buyBrainId],
    );
    if (brain) {
      const bought = await purchaseBrain({
        brainId: buyBrainId,
        buyerId: userId,
        sellerId: brain.owner_id,
      }).catch((err) => ({ ok: false as const, reason: String(err) as never }));
      console.log(
        `[payments] follow-up purchase ${buyBrainId}: ` +
          (bought.ok ? "done" : `left as balance (${bought.reason})`),
      );
    } else {
      console.warn(`[payments] follow-up brain ${buyBrainId} is gone — money stays as balance`);
    }
  }

  return NextResponse.json({ ok: true });
}
