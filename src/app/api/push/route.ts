import { NextResponse } from "next/server";
import { query } from "@/db";
import { currentUser } from "@/lib/session";

/**
 * Push subscription registry — any signed-in person. Users hear about
 * operator replies; operators additionally hear about messages and payments
 * (the sender decides the audience, not this table). The endpoint is the
 * identity: a browser re-subscribing lands on its own row.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in" }, { status: 401 });
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
    [user.id, sub.endpoint, sub.keys.p256dh, sub.keys.auth],
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in" }, { status: 401 });
  const { endpoint } = (await req.json()) as { endpoint?: string };
  if (endpoint) {
    // Own rows only — an endpoint is unguessable, but why rely on that.
    await query(`delete from push_subscriptions where endpoint = $1 and user_id = $2`, [
      endpoint,
      user.id,
    ]);
  }
  return NextResponse.json({ ok: true });
}
