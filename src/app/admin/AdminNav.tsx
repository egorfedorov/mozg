import Link from "next/link";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "People" },
  { href: "/admin/brains", label: "Brains" },
];

export default function AdminNav({ active }: { active: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: "1.25rem",
        alignItems: "center",
        borderBottom: "1.5px solid var(--ink)",
        paddingBottom: ".75rem",
        marginTop: "1.5rem",
      }}
    >
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className="mono"
          style={{
            fontSize: ".8125rem",
            color: t.href === active ? "var(--ink)" : "var(--ink-2)",
            borderBottom:
              t.href === active ? "2px solid var(--ink)" : "2px solid transparent",
            paddingBottom: ".15rem",
          }}
        >
          {t.label}
        </Link>
      ))}
      <span style={{ flex: 1 }} />
      <Link className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)" }} href="/brains">
        back to the app →
      </Link>
    </div>
  );
}
