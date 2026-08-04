import { NextRequest, NextResponse } from "next/server";

/**
 * learn.mozg.sh is the learning service's own front door — same app, own
 * address. The host decides the surface: requests arriving on the learn
 * subdomain are rewritten into /learn, so the service has clean URLs
 * (learn.mozg.sh/mozg/expo) without a second deployment to operate.
 */
const SESSION_COOKIE = "__Secure-better-auth.session_token";
const MIGRATED_MARK = "ck_domain";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  if (!host.startsWith("learn.")) {
    // Sessions issued before cookies widened to .mozg.sh are pinned to this
    // host and invisible to learn.mozg.sh. Re-issue the same token once with
    // the wide domain — the marker cookie stops us doing it on every request.
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (host.startsWith("mozg.sh") && token && !req.cookies.get(MIGRATED_MARK)) {
      const res = NextResponse.next();
      res.cookies.set(SESSION_COOKIE, token, {
        domain: ".mozg.sh",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
      });
      res.cookies.set(MIGRATED_MARK, "1", {
        domain: ".mozg.sh",
        path: "/",
        secure: true,
        maxAge: 60 * 60 * 24 * 30,
      });
      return res;
    }
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;

  // Internal links inside learn pages point at /learn/... (they must work on
  // mozg.sh too). On the subdomain that would render as learn.mozg.sh/learn/…
  // — redirect to the clean form instead of serving a duplicate URL.
  if (pathname.startsWith("/learn")) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice("/learn".length) || "/";
    return NextResponse.redirect(url, 308);
  }

  // Assets, API and auth stay where they are; only pages move under /learn.
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/brand") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // The shared footer and shell link to mozg pages with relative hrefs (they
  // must — the same components render on mozg.sh). On this host those paths
  // belong to the main site, so they go home instead of 404ing under /learn.
  const MOZG_PATHS = [
    "/why", "/vs", "/vs-skills", "/collective", "/make", "/guide", "/connect",
    "/explore", "/pricing", "/beta", "/changelog", "/chat", "/brains",
    "/settings", "/b", "/mind", "/gift", "/pay", "/admin", "/llms.txt",
  ];
  if (MOZG_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.redirect(`https://mozg.sh${pathname}${req.nextUrl.search}`, 308);
  }

  const url = req.nextUrl.clone();
  url.pathname = `/learn${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
