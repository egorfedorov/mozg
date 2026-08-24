import { NextResponse } from "next/server";
import { query } from "@/db";
import { env } from "@/lib/env";
import { validSignature, mergedRepo, rootMatchesRepo, type PushEvent } from "@/lib/github";
import { enqueueCrawl } from "@/worker/queue";

export const dynamic = "force-dynamic";

/**
 * "Updated on merge" for repository brains.
 *
 * The maintenance pass already re-walks every crawl root on a seven-day clock,
 * so a repo brain is never more than a week stale without this. What this buys
 * is the difference between a week and a minute, which is the difference
 * between a brain that describes how the team works and one that describes how
 * it worked before the refactor everyone is now asking about.
 *
 * Deliberately does almost nothing: verify, find the roots, mark them queued.
 * The crawl worker does the rest, and it is already idempotent — an advisory
 * lock per source, and pages that already exist are skipped rather than
 * duplicated. So a repository with ten merges in an hour costs ten discovery
 * walks and re-reads only the files whose content hash actually moved.
 */
export async function POST(req: Request) {
  const secret = env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "push callbacks are not configured" }, { status: 503 });
  }

  // Raw body first: the signature covers the bytes GitHub sent, and
  // re-serialising parsed JSON does not reproduce them.
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"), secret)) {
    console.warn("[github] rejected a push callback with a bad signature");
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  // Ping is what GitHub sends when the webhook is first saved; answering it
  // is how the owner sees a green tick instead of a red one.
  const event = req.headers.get("x-github-event");
  if (event === "ping") return NextResponse.json({ ok: true, pong: true });
  if (event !== "push") return NextResponse.json({ ok: true, ignored: event });

  let payload: PushEvent;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  const repo = mergedRepo(payload);
  if (!repo) {
    return NextResponse.json({ ok: true, ignored: payload.ref ?? "no ref" });
  }

  const roots = await query<{ id: string; url: string }>(
    `select id, url from sources
      where kind = 'repo' and url is not null and status <> 'processing'`,
  );
  const mine = roots.filter((r) => rootMatchesRepo(r.url, repo));

  for (const root of mine) {
    await query(`update sources set status = 'queued', error = null where id = $1`, [root.id]);
    await enqueueCrawl(root.id);
  }

  console.log(`[github] push to ${repo} — requeued ${mine.length} repo source(s)`);
  return NextResponse.json({ ok: true, requeued: mine.length });
}
