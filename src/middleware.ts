import { NextRequest, NextResponse } from "next/server";

/**
 * learn.mozg.sh is the learning service's own front door — same app, own
 * address. The host decides the surface: requests arriving on the learn
 * subdomain are rewritten into /learn, so the service has clean URLs
 * (learn.mozg.sh/mozg/expo) without a second deployment to operate.
 */
export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  if (!host.startsWith("learn.")) return NextResponse.next();

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
