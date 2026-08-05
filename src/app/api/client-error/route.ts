import { NextResponse } from "next/server";
import { query } from "@/db";
import { currentUser } from "@/lib/session";

/**
 * The browser's lane into the error center. Anonymous reports are accepted —
 * a landing-page crash is exactly the error nobody signed in to report —
 * but deduped hard: one open row per message per hour, because a render
 * loop firing onerror at 60fps must not become sixty thousand rows.
 */
export async function POST(req: Request) {
  const user = await currentUser().catch(() => null);
  const body = (await req.json().catch(() => null)) as {
    message?: string;
    stack?: string;
    url?: string;
  } | null;

  const message = String(body?.message ?? "").trim().slice(0, 500);
  if (!message) return NextResponse.json({ ok: false }, { status: 400 });

  await query(
    `insert into app_errors (source, kind, message, detail, user_id)
     select 'client', 'js', $1, $2, $3
      where not exists (
        select 1 from app_errors
         where source = 'client' and message = $1 and resolved_at is null
           and created_at > now() - interval '1 hour')`,
    [
      message,
      [body?.url, body?.stack].filter(Boolean).join("\n").slice(0, 4000) || null,
      user?.id ?? null,
    ],
  ).catch(() => {});

  return NextResponse.json({ ok: true });
}
