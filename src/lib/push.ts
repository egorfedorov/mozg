import webpush from "web-push";
import { query } from "@/db";
import { env } from "@/lib/env";

/**
 * Web push to the operator's browsers (Chrome, Safari 16.4+, Firefox — all
 * speak the same VAPID protocol now). Fire-and-forget by design: a push is a
 * nicety on top of the mascot badge, and nothing that triggers one — a chat
 * message, a payment — may fail because a push endpoint had a bad day.
 */

export const pushReady = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

let configured = false;
function vapid(): boolean {
  if (!pushReady) return false;
  if (!configured) {
    webpush.setVapidDetails(
      "mailto:" + (env.OPERATOR_EMAIL ?? "ops@mozg.sh"),
      env.VAPID_PUBLIC_KEY!,
      env.VAPID_PRIVATE_KEY!,
    );
    configured = true;
  }
  return true;
}

/**
 * Send to every subscribed browser. Dead endpoints (404/410 — the browser
 * unsubscribed or the user revoked permission) are pruned as they answer.
 */
export async function sendPush(payload: {
  title: string;
  body: string;
  /** Where a click lands, e.g. "/admin/chat". */
  url: string;
}): Promise<void> {
  if (!vapid()) return;

  const subs = await query<{ id: string; endpoint: string; p256dh: string; auth: string }>(
    `select id, endpoint, p256dh, auth from push_subscriptions`,
  );

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 3600 },
        );
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await query(`delete from push_subscriptions where id = $1`, [s.id]).catch(() => {});
        }
      }
    }),
  );
}
