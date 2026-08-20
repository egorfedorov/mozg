import { NextResponse, type NextRequest } from "next/server";
import { maybeOne } from "@/db";
import { REFERRAL_COOKIE, REFERRAL_DAYS, recordClick, today, visitorKey } from "@/lib/referral";

/**
 * A referral link: mozg.sh/r/{handle}
 *
 * Three things happen here and then the visitor is gone, which is the whole
 * design brief — an affiliate link that makes somebody wait is an affiliate
 * link that loses them.
 *
 *   1. the handle is resolved against the table, so only a real account can be
 *      credited and a typo lands on the home page rather than on a 404
 *   2. the open is counted, once per visitor per day
 *   3. the claim is written to a cookie for 30 days
 *
 * A route rather than a `?ref=` the middleware reads, because the middleware
 * runs on the edge with no database: it cannot tell a handle from a utm_source,
 * and money must not be paid on a string nobody checked. It also means the
 * link is short enough to say out loud.
 */
export const dynamic = "force-dynamic";

/** middleware.ts owns this name; it is written here only to correct the guess
    that runs before this handler does. */
const SOURCE_COOKIE = "mozg_src";

/** Where the visitor is put down. Same-site paths only — an open redirect on
    a link designed to be shared widely is exactly how one becomes a phishing
    hop. */
function landing(to: string | null): string {
  if (!to || !to.startsWith("/") || to.startsWith("//")) return "/";
  return to;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const clean = handle.trim().toLowerCase().slice(0, 30);

  const referrer = await maybeOne<{ id: string }>(
    `select id from "user" where handle = $1`,
    [clean],
  );

  const url = new URL(landing(req.nextUrl.searchParams.get("to")), req.nextUrl.origin);
  // The existing first-touch reporting learns the same thing from the same
  // visit — middleware.ts reads ?ref= into mozg_src — so nothing has to be
  // taught twice about where an account came from.
  if (referrer) url.searchParams.set("ref", clean);

  const res = NextResponse.redirect(url, 302);
  if (!referrer) return res;

  const day = today();
  await recordClick(
    referrer.id,
    visitorKey(
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
      req.headers.get("user-agent") ?? "unknown",
      day,
    ),
    day,
  );

  // First touch, like every other attribution here: someone who arrives
  // through two affiliates' links belongs to the one who reached them first,
  // and overwriting would hand every referral to whoever posts last.
  if (!req.cookies.get(REFERRAL_COOKIE)) {
    res.cookies.set(REFERRAL_COOKIE, clean, {
      maxAge: 60 * 60 * 24 * REFERRAL_DAYS,
      sameSite: "lax",
      path: "/",
      httpOnly: true,
    });

    // And name the source, because the middleware just got it wrong. It runs
    // ahead of this handler with no database and no referer to read, so it
    // stamped mozg_src=direct — which would file every referral arrival under
    // the one label that means "nobody sent them".
    //
    // Safe to overwrite only in this branch: req.cookies is what the browser
    // sent, so an absent referral claim means an absent source too, and the
    // "direct" being replaced was minted a millisecond ago on this very
    // request rather than earned on an earlier visit.
    res.cookies.set(SOURCE_COOKIE, `r/${clean}`, {
      maxAge: 60 * 60 * 24 * REFERRAL_DAYS,
      sameSite: "lax",
      path: "/",
      httpOnly: false,
    });
  }
  return res;
}
