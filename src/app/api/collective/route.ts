import { NextResponse } from "next/server";
import { searchCollective } from "@/lib/search";
import { createIpLimiter } from "@/lib/collective";
import { isTopic } from "@/lib/topics";

/**
 * The collective mind, queryable: one question against every public brain,
 * answers grouped by the brain that gave them. Anonymous by design — the
 * point is to show a stranger what the catalogue knows before they sign up.
 *
 * Reads the database and embeds on every call.
 */
export const dynamic = "force-dynamic";

// Every call pays for an embedding; 30/hour per IP is generous for a human
// and useless for a scraper.
const allow = createIpLimiter({ max: 30, windowMs: 60 * 60 * 1000 });

const MIN_QUERY = 3;
const MAX_QUERY = 200;

export async function GET(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  if (!allow(ip)) {
    return NextResponse.json(
      { error: "Too many requests — try again later." },
      { status: 429 },
    );
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY);
  if (q.length < MIN_QUERY) {
    return NextResponse.json(
      { error: `q must be at least ${MIN_QUERY} characters.` },
      { status: 400 },
    );
  }

  const topicParam = url.searchParams.get("topic");
  const results = await searchCollective(q, {
    topic: isTopic(topicParam) ? topicParam : null,
  });

  return NextResponse.json({
    query: q,
    results: results.map((r) => ({
      ...r,
      url: `/b/${r.handle}/${r.slug}`,
    })),
  });
}
