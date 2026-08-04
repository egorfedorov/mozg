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
  // Assets, API and auth stay where they are; only pages move under /learn.
  if (
    pathname.startsWith("/learn") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/brand") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = `/learn${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
