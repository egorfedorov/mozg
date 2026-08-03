import Link from "next/link";
import { currentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";

/**
 * The header for the public side of the site.
 *
 * One navigation per page. Everything readable — why, the comparison, both
 * guides, connect, the catalogue — lives in the contents strip underneath, so
 * the bar carries only identity and the way out of reading: sign in, or back
 * to your own work.
 *
 * It used to repeat connect, guide and the catalogue in both rows, which is the
 * same two-navigations mistake the admin console had. Signed-in workspace pages
 * do not render this at all; they have the rail.
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
              className="navlink hide-sm"
              data-active={active === "account"}
              href="/settings"
              style={{ color: "var(--ink-3)" }}
            >
              {user.handle ?? user.email}
            </Link>
            <Link className="btn" href="/brains">
              Your brains
            </Link>
          </>
        ) : (
          <Link className="btn" href="/sign-in">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
