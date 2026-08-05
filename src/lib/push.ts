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

/** Straight from env, NOT lib/admin — that module pulls next/navigation,
    which the worker bundle (payments → push) must never carry. */
const ADMIN_EMAILS = env.ADMIN_EMAILS.split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Send to the target's subscribed browsers: one person's, or every
 * operator's. Dead endpoints (404/410 — the browser unsubscribed or the
 * user revoked permission) are pruned as they answer.
 */
export async function sendPush(
  payload: {
    title: string;
    body: string;
    /** Where a click lands, e.g. "/admin/chat". */
    url: string;
  },
  target: { userId: string } | "admins" = "admins",
): Promise<void> {
  if (!vapid()) return;

  const subs =
    target === "admins"
      ? await query<{ id: string; endpoint: string; p256dh: string; auth: string }>(
          `select ps.id, ps.endpoint, ps.p256dh, ps.auth
             from push_subscriptions ps join "user" u on u.id = ps.user_id
            where lower(u.email) = any($1::text[])`,
          [ADMIN_EMAILS],
        )
      : await query<{ id: string; endpoint: string; p256dh: string; auth: string }>(
          `select id, endpoint, p256dh, auth from push_subscriptions where user_id = $1`,
          [target.userId],
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
