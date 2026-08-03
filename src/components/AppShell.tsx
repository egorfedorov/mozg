import Link from "next/link";
import { currentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { query } from "@/db";
import { formatCents } from "@/lib/money-math";

/**
 * The signed-in half of the product. Everything you do to your own account —
 * brains, connecting an agent, money, tokens — sits inside this one frame, so
 * moving between them never feels like leaving the app.
 *
 * The marketing pages deliberately do not use it: they end in a footer full of
 * links out, which is the opposite of what a workspace wants.
 */

const GROUPS: {
  title: string;
  items: { href: string; label: string; hint?: string }[];
}[] = [
  {
    title: "Work",
    items: [
      { href: "/brains", label: "Overview" },
      { href: "/brains/new", label: "New brain" },
      { href: "/connect", label: "Connect an agent" },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/settings/balance", label: "Balance" },
      { href: "/settings/purchases", label: "Purchases" },
      { href: "/settings/tokens", label: "Tokens" },
      { href: "/settings", label: "Plan & profile" },
    ],
  },
];

export default async function AppShell({
  active,
  title,
  eyebrow,
  action,
  narrow,
  children,
}: {
  /** href of the current page, for the nav */
  active: string;
  /** Omit when the page renders its own heading (a brain page, say). */
  title?: string;
  eyebrow?: string;
  action?: React.ReactNode;
  narrow?: boolean;
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) return null; // callers redirect; this is belt and braces

  const [row] = await query<{ balance_cents: number }>(
    `select balance_cents from "user" where id = $1`,
    [user.id],
  );
  const balance = row?.balance_cents ?? 0;

  const groups = isAdmin(user)
    ? [
        ...GROUPS,
        {
          title: "Operator",
          items: [
            { href: "/admin", label: "System" },
            { href: "/admin/users", label: "People" },
            { href: "/admin/brains", label: "All brains" },
          ],
        },
      ]
    : GROUPS;

  return (
    <div className="app">
      <aside className="app-rail">
        <Link href="/" className="wordmark" style={{ fontSize: "1.25rem" }}>
          mozg<span>.</span>
        </Link>

        <Link href="/settings" className="app-me">
          <span className="app-avatar" aria-hidden>
            {(user.handle ?? user.email)[0]?.toUpperCase() ?? "?"}
          </span>
          <span style={{ minWidth: 0 }}>
            <span className="app-me-name">{user.handle ?? user.email.split("@")[0]}</span>
            <span className="app-me-sub">
              {user.plan} · {formatCents(balance)}
            </span>
          </span>
        </Link>

        <nav className="app-nav">
          {groups.map((g) => (
            <div key={g.title}>
              <p className="eyebrow app-nav-title">{g.title}</p>
              {g.items.map((i) => (
                <Link key={i.href} href={i.href} data-active={i.href === active}>
                  {i.label}
                </Link>
              ))}
            </div>
          ))}

          <div>
            <p className="eyebrow app-nav-title">Elsewhere</p>
            <Link href="/explore">Catalogue</Link>
            <Link href="/guide">Guide</Link>
          </div>
        </nav>
      </aside>

      <div className="app-main" style={narrow ? { maxWidth: 820 } : undefined}>
        {title && (
          <header className="app-head">
            <div style={{ minWidth: 0 }}>
              {eyebrow && <p className="eyebrow">{eyebrow}</p>}
              <h1 className="display app-title">{title}</h1>
            </div>
            {action}
          </header>
        )}

        {children}
      </div>
    </div>
  );
}
