import { NextResponse } from "next/server";
import { systemStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

/**
 * Is anything actually broken?
 *
 * Public, so it deliberately says nothing a stranger could use: no versions,
 * no paths, no counts of real data. Just whether each dependency answers, plus
 * the two numbers that show the pipeline is moving rather than wedged.
 *
 * The judgement itself lives in lib/status.ts, shared with /status — one
 * definition of "up", whether a monitor asks or a person does.
 */
export async function GET() {
  const status = await systemStatus();

  // Kept flat and stable: uptime monitors have been parsing this shape since
  // the first deploy, and a status page is not a reason to break their alert.
  // "degraded" reads as down here on purpose — the old shape was two-valued
  // and a monitor that has only ever seen ok/down must not start ignoring a
  // word it does not know.
  const checks = Object.fromEntries(
    status.services.map((s) => [s.key, s.state === "ok" ? "ok" : "down"]),
  );

  // 503 means "stop sending traffic here". Only the database and a stuck
  // queue earn that: without the embedder, search falls back to full text
  // and every page still serves — paging the operator because a busy
  // embedder answered slowly cost us five false alarms in one evening.
  // Embeddings being down still shows in `checks` and in the status word.
  const serving = !status.services.some((s) => s.state === "down");

  return NextResponse.json(
    {
      status: status.state === "ok" ? "ok" : "degraded",
      version: process.env.GIT_SHA ?? "unknown",
      checks,
      queue: status.queue,
    },
    {
      status: serving ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
