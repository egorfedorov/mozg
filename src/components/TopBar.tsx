import Link from "next/link";
import { currentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";

/**
 * The header answers a different question depending on who is reading it.
 * Signed out, it is "what is this and how do I start"; signed in, it is "take
 * me back to my work". Same bar, two sets of links — not one set with half of
 * it greyed out.
 */
export default async function TopBar({ active }: { active?: string }) {
  const user = await currentUser();

  return (
    <header className="topbar">
      <div className="shell topbar-inner">
        <Link href="/" className="wordmark">
          mozg<span>.</span>
        </Link>

        {user ? (
          <>
            <Link className="navlink" data-active={active === "brains"} href="/brains">
              brains
            </Link>
            <Link className="navlink" data-active={active === "explore"} href="/explore">
              explore
            </Link>
            <Link className="navlink hide-sm" data-active={active === "connect"} href="/connect">
              connect
            </Link>
            <Link className="navlink hide-sm" data-active={active === "guide"} href="/guide">
              guide
            </Link>
            {isAdmin(user) && (
              <Link
                className="navlink hide-sm"
                data-active={active === "admin"}
                href="/admin"
                style={{ color: "var(--color-riso-red)" }}
              >
                admin
              </Link>
            )}
            <Link
              className="navlink"
              data-active={active === "account"}
              href="/settings"
              style={{ color: "var(--ink-3)" }}
            >
              {user.handle ?? user.email}
            </Link>
          </>
        ) : (
          <>
            <Link className="navlink hide-sm" data-active={active === "why"} href="/why">
              why
            </Link>
            <Link className="navlink" data-active={active === "explore"} href="/explore">
              explore
            </Link>
            <Link className="navlink hide-sm" data-active={active === "guide"} href="/guide">
              guide
            </Link>
            <Link className="navlink hide-sm" data-active={active === "connect"} href="/connect">
              connect
            </Link>
            <Link className="btn" href="/sign-in">
              Sign in
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
