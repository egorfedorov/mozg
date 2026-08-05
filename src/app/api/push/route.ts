import { NextResponse } from "next/server";
import { query } from "@/db";
import { requireAdmin } from "@/lib/admin";

/**
 * Push subscription registry, operator-only for now. The endpoint is the
 * identity: a browser re-subscribing lands on its own row.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  const sub = (await req.json()) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: "not a push subscription" }, { status: 400 });
  }
  await query(
    `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
     values ($1, $2, $3, $4)
     on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth`,
    [admin.id, sub.endpoint, sub.keys.p256dh, sub.keys.auth],
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  await requireAdmin();
  const { endpoint } = (await req.json()) as { endpoint?: string };
  if (endpoint) {
    await query(`delete from push_subscriptions where endpoint = $1`, [endpoint]);
  }
  return NextResponse.json({ ok: true });
}
