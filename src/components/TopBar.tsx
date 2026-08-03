import Link from "next/link";
import { currentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";

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
            <Link className="navlink" data-active={active === "tokens"} href="/settings/tokens">
              tokens
            </Link>
            <Link className="navlink" data-active={active === "explore"} href="/explore">
              explore
            </Link>
            <Link className="navlink hide-sm" data-active={active === "connect"} href="/connect">
              connect
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
              className="navlink hide-sm"
              href="/settings"
              style={{ color: "var(--ink-3)" }}
            >
              {user.handle ?? user.email}
            </Link>
          </>
        ) : (
          <>
            <Link className="navlink hide-sm" href="/why">
              why
            </Link>
            <Link className="navlink" data-active={active === "explore"} href="/explore">
              explore
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
