import { NextResponse } from "next/server";
import { query } from "@/db";
import { embedHealthy } from "@/lib/embed";

export const dynamic = "force-dynamic";

/**
 * Is anything actually broken?
 *
 * Public, so it deliberately says nothing a stranger could use: no versions,
 * no paths, no counts of real data. Just whether each dependency answers, plus
 * the two numbers that show the pipeline is moving rather than wedged.
 */
export async function GET() {
  const checks: Record<string, "ok" | "down"> = {};

  const dbOk = await query("select 1").then(
    () => true,
    () => false,
  );
  checks.database = dbOk ? "ok" : "down";
  checks.embeddings = (await embedHealthy()) ? "ok" : "down";

  // Sources stuck processing for over an hour mean the worker died mid-job:
  // the row never reaches ready or failed, so nothing else surfaces it.
  let queue: { pending: number; stuck: number } | null = null;
  if (dbOk) {
    const rows = await query<{ pending: number; stuck: number }>(
      `select
         count(*) filter (where status in ('queued','processing'))::int as pending,
         count(*) filter (
           where status = 'processing' and created_at < now() - interval '1 hour'
         )::int as stuck
       from sources`,
    ).catch(() => []);
    queue = rows[0] ?? null;
  }
  checks.queue = queue && queue.stuck > 0 ? "down" : "ok";

  const healthy = Object.values(checks).every((v) => v === "ok");

  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", checks, queue },
    {
      status: healthy ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
