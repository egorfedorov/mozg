import { markup } from "@/lib/markup";
import { translator, msg } from "@/lib/t";
import Link from "next/link";
import SignOutLink from "@/components/SignOutLink";
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
  items: { href: string; label: string; hint?: string; badge?: number }[];
}[] = [
  {
    title: msg("Work"),
    items: [
      { href: "/brains", label: msg("Overview") },
      { href: "/mind", label: msg("Your mind") },
      { href: "/brains/new", label: msg("New brain") },
      { href: "/connect", label: msg("Connect an agent") },
      { href: "/achievements", label: msg("Achievements") },
      { href: "/chat", label: msg("chatmozg") },
    ],
  },
  {
    title: msg("Account"),
    items: [
      { href: "/settings/balance", label: msg("Balance") },
      { href: "/settings/purchases", label: msg("Library") },
      { href: "/settings/tokens", label: msg("Tokens") },
      { href: "/settings/usage", label: msg("Usage") },
      { href: "/settings/packs", label: msg("Packs & people") },
      { href: "/settings", label: msg("Plan & profile") },
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
  const t = await translator();

  const user = await currentUser();
  if (!user) return null; // callers redirect; this is belt and braces

  const [row] = await query<{ balance_cents: number }>(
    `select balance_cents from "user" where id = $1`,
    [user.id],
  );
  const balance = row?.balance_cents ?? 0;

  // The operator should see a waiting message — or a fresh failure — from
  // anywhere in the app, not only by opening the right admin page on a hunch.
  const [adminUnread, adminErrors] = isAdmin(user)
    ? await Promise.all([
        query<{ n: number }>(
          `select count(*)::int as n from chat_messages
            where author = 'user' and read_at is null`,
        ).then((r) => r[0]?.n ?? 0),
        query<{ n: number }>(
          `select count(*)::int as n from app_errors where resolved_at is null`,
        ).then((r) => r[0]?.n ?? 0),
      ])
    : [0, 0];

  // The public page only exists once there is a handle to put it under, and
  // linking to /b/null would be a 404 with your own name on it.
  const base = user.handle
    ? GROUPS.map((g) =>
        g.title === "Work"
          ? { ...g, items: [...g.items, { href: `/b/${user.handle}`, label: "Your page" }] }
          : g,
      )
    : GROUPS;

  const groups = isAdmin(user)
    ? [
        ...base,
        {
          title: "Operator",
          items: [
            { href: "/admin", label: "System" },
            { href: "/admin/chat", label: "Chat", badge: adminUnread },
            { href: "/admin/errors", label: "Errors", badge: adminErrors },
            { href: "/admin/users", label: "People" },
            { href: "/admin/brains", label: "All brains" },
            { href: "/admin/marketing", label: "Marketing" },
            { href: "/admin/lessons", label: "Lessons" },
            { href: "/admin/promo", label: "Promo" },
            { href: "/admin/announcements", label: "Announcements" },
          ],
        },
      ]
    : base;

  return (
    <div className="app">
      <aside className="app-rail">
        {/* Below 900px the rail is a bar across the top and everything under
            the wordmark collapses behind this toggle. A checkbox rather than
            React state on purpose: the shell is a server component, and a
            phone that has not finished hydrating still has to be able to open
            the only navigation the workspace has. Desktop never shows it. */}
        <input type="checkbox" id="app-nav-open" className="app-nav-check" aria-label="Menu" />

        <div className="app-rail-head">
          <Link href="/" className="wordmark" style={{ fontSize: "1.25rem" }}>
            {markup(t("mozg<0>.</0>"), [
            <span key="s0" />,
          ])}</Link>

          <label htmlFor="app-nav-open" className="app-burger mono">
            <span className="app-burger-shut">{t("☰ menu")}</span>
            <span className="app-burger-open">{t("✕ close")}</span>
          </label>
        </div>

        <div className="app-rail-body">
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
                <p className="eyebrow app-nav-title">{t(g.title)}</p>
                {g.items.map((i) => (
                  <Link key={i.href} href={i.href} data-active={i.href === active}>
                    {t(i.label)}
                    {(i.badge ?? 0) > 0 && <span className="nav-badge">{i.badge}</span>}
                  </Link>
                ))}
              </div>
            ))}

            <div>
              <p className="eyebrow app-nav-title">{t("Elsewhere")}</p>
              <Link href="/explore">{t("Catalogue")}</Link>
              <Link href="/guide">{t("Guide")}</Link>
              <SignOutLink />
            </div>
          </nav>
        </div>
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
