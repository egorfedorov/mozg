import { NextRequest, NextResponse } from "next/server";

/**
 * learn.mozg.sh is the learning service's own front door — same app, own
 * address. The host decides the surface: requests arriving on the learn
 * subdomain are rewritten into /learn, so the service has clean URLs
 * (learn.mozg.sh/mozg/expo) without a second deployment to operate.
 *
 * gallery.mozg.sh is the same trick for the style gallery, but much smaller:
 * the gallery is one page, and everything you can click from it — a style's
 * page, signing in, buying — belongs to the main site. So the root serves the
 * wall and every other path goes home, rather than growing a second tree that
 * would have to be kept in step with the first.
 */
const SESSION_COOKIE = "__Secure-better-auth.session_token";

/** Paths that must behave identically whichever host they arrive on. */
function isInfrastructure(pathname: string): boolean {
  return (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/brand") ||
    pathname.includes(".")
  );
}

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";

  if (host.startsWith("gallery.")) {
    const { pathname } = req.nextUrl;
    if (isInfrastructure(pathname)) return NextResponse.next();

    // The wall itself.
    if (pathname === "/") {
      const url = req.nextUrl.clone();
      url.pathname = "/gallery";
      return NextResponse.rewrite(url);
    }

    // The shared header and footer link to /gallery with a relative href,
    // because the same components render on mozg.sh. On this host that would
    // be gallery.mozg.sh/gallery — the same page at a second URL, which is
    // exactly the duplicate the learn subdomain also had to fix.
    if (pathname === "/gallery") {
      return NextResponse.redirect(new URL("/", req.nextUrl), 308);
    }

    // The buyer's own images.
    if (pathname === "/mine") {
      const url = req.nextUrl.clone();
      url.pathname = "/gallery/mine";
      return NextResponse.rewrite(url);
    }

    // A style's own room: gallery.mozg.sh/egorfdrv/riso-style serves what
    // /gallery/egorfdrv/riso-style holds. Same trick as learn's rewrite, and
    // the reason this host is no longer a single page.
    if (/^\/[^/]+\/[^/]+$/.test(pathname)) {
      const url = req.nextUrl.clone();
      url.pathname = `/gallery${pathname}`;
      return NextResponse.rewrite(url);
    }

    // A style's page, the catalogue, the account — all of it is the main site.
    return NextResponse.redirect(`https://mozg.sh${pathname}${req.nextUrl.search}`, 308);
  }

  if (!host.startsWith("learn.")) {
    // Two same-name session cookies at different scopes is a real problem: one
    // left over from before the cookie widened to .mozg.sh, one current, and the
    // server reads the stale one first — which is how a successful OAuth used to
    // bounce back to the sign-in form.
    //
    // The old cure was worse than the disease. It deleted *both* scopes on any
    // request to /sign-in, and "any request" includes a browser prefetching the
    // link on hover and the MCP OAuth flow, whose consent step sends an already
    // signed-in user to this very page. That is why sessions kept dropping:
    // people were being signed out by walking past the door.
    //
    // So delete only the legacy host-only cookie, and leave the domain-scoped one
    // — the live session — alone. Browsers key cookies by (name, domain, path), so
    // a Set-Cookie without a Domain attribute targets exactly the host-only one.
    // Anyone still holding only that cookie is signed out once, on the form, which
    // is the migration this always meant to be rather than a recurring surprise.
    if (host.startsWith("mozg.sh") && req.nextUrl.pathname === "/sign-in") {
      const res = NextResponse.next();
      res.headers.append(
        "Set-Cookie",
        `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
      );
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
  if (isInfrastructure(pathname)) return NextResponse.next();

  // The shared footer and shell link to mozg pages with relative hrefs (they
  // must — the same components render on mozg.sh). On this host those paths
  // belong to the main site, so they go home instead of 404ing under /learn.
  const MOZG_PATHS = [
    "/why", "/vs", "/vs-skills", "/collective", "/make", "/guide", "/connect",
    "/explore", "/pricing", "/beta", "/changelog", "/chat", "/brains",
    "/settings", "/b", "/mind", "/gift", "/pay", "/admin", "/llms.txt",
    // The shared footer links to these from learn pages too.
    "/terms", "/privacy", "/cookies", "/status", "/about", "/gallery", "/styles",
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
