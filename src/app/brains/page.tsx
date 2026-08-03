import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import BrainCard from "@/components/BrainCard";
import { currentUser } from "@/lib/session";
import { listBrains } from "@/lib/brains";
import { dashboardStats, needsAttention, recentActivity } from "@/lib/dashboard";
import { formatCents } from "@/lib/money-math";

export const dynamic = "force-dynamic";

export const metadata = { title: "Your brains — mozg" };

const ATTENTION_TINT: Record<string, string> = {
  review: "var(--color-riso-violet)",
  failed: "var(--color-riso-red)",
  "no-goal": "var(--color-riso-orange)",
  unexamined: "var(--color-riso-orange)",
  gap: "var(--color-riso-blue)",
};

const ATTENTION_ACTION: Record<string, string> = {
  review: "Review",
  failed: "Look",
  "no-goal": "Set a goal",
  unexamined: "Run it",
  gap: "Add sources",
};

export default async function BrainsPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/brains");

  const [brains, stats, attention, activity] = await Promise.all([
    listBrains(user.id),
    dashboardStats(user.id),
    needsAttention(user.id),
    recentActivity(user.id),
  ]);

  if (!brains.length) return <FirstRun />;

  const trend = stats.callsWeek - stats.callsPrevWeek;

  return (
    <AppShell
      active="/brains"
      eyebrow="Dashboard"
      title="Your brains"
      action={
        <Link className="btn" href="/brains/new">
          New brain
        </Link>
      }
    >
      <>
        {/* Numbers that change what you do, not vanity counters. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: "1px",
            background: "var(--rule)",
            border: "1.5px solid var(--ink)",
          }}
        >
          <Stat label="Brains" value={String(stats.brains)} />
          <Stat label="Notes" value={stats.notes.toLocaleString()} />
          <Stat
            label="Agent calls · 7d"
            value={stats.callsWeek.toLocaleString()}
            note={
              stats.callsPrevWeek || stats.callsWeek
                ? trend === 0
                  ? "same as last week"
                  : `${trend > 0 ? "+" : "−"}${Math.abs(trend)} vs last week`
                : "connect an agent"
            }
          />
          <Stat label="Balance" value={formatCents(stats.balanceCents)} href="/settings/balance" />
        </div>

        {attention.length > 0 && (
          <section style={{ marginTop: "2.5rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: ".75rem",
              }}
            >
              <h2 className="display" style={{ fontSize: "1.375rem" }}>
                Needs you
              </h2>
              <span className="eyebrow">{attention.length} thing{attention.length === 1 ? "" : "s"}</span>
            </div>

            <div className="panel" style={{ padding: 0 }}>
              {attention.slice(0, 8).map((item, i) => (
                <Link
                  key={`${item.kind}-${item.brainSlug}-${i}`}
                  href={item.href}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "3px 1fr auto",
                    gap: "1rem",
                    alignItems: "center",
                    padding: ".8rem 1.25rem .8rem .5rem",
                    borderBottom: "1px solid var(--rule)",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      alignSelf: "stretch",
                      background: ATTENTION_TINT[item.kind],
                    }}
                  />
                  <span>
                    <strong>{item.brainTitle}</strong>
                    <span
                      style={{
                        display: "block",
                        color: "var(--ink-2)",
                        fontSize: ".9375rem",
                      }}
                    >
                      {item.detail}
                    </span>
                  </span>
                  <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)" }}>
                    {ATTENTION_ACTION[item.kind]} →
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section style={{ marginTop: "2.5rem" }}>
          <h2 className="display" style={{ fontSize: "1.375rem", marginBottom: ".75rem" }}>
            All brains
          </h2>
          <div className="grid-brains">
            {brains.map((brain) => (
              <BrainCard key={brain.id} brain={brain} />
            ))}
            <Link href="/brains/new" className="card-new">
              <span className="plus">+</span>
              <span className="mono" style={{ fontSize: ".8125rem" }}>
                New brain
              </span>
            </Link>
          </div>
        </section>

        <section style={{ marginTop: "2.5rem" }}>
          <h2 className="display" style={{ fontSize: "1.375rem", marginBottom: ".75rem" }}>
            What your agents did
          </h2>

          {activity.length === 0 ? (
            <div className="panel">
              <p style={{ margin: 0, color: "var(--ink-2)" }}>
                Nothing yet. Once a brain is connected, every tool call an agent
                makes shows up here — which is the fastest way to see whether it is
                actually being read.{" "}
                <Link href="/connect" style={{ textDecoration: "underline" }}>
                  Connect one
                </Link>
                .
              </p>
            </div>
          ) : (
            <section className="term">
              <div className="term-bar">
                <span className="term-dot" />
                <span className="term-dot" />
                <span className="term-dot" />
                <span style={{ marginLeft: ".5rem" }}>across every brain</span>
              </div>
              {activity.map((call) => (
                <div key={call.id} style={{ display: "flex", gap: ".75rem" }}>
                  <span className="c" style={{ flexShrink: 0 }} suppressHydrationWarning>
                    {new Date(call.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      className={call.ok ? "k" : ""}
                      style={!call.ok ? { color: "#f15060" } : undefined}
                    >
                      {call.tool}
                    </span>
                    {call.query && (
                      <span className="t">
                        (&quot;
                        {call.query.length > 48 ? `${call.query.slice(0, 48)}…` : call.query}
                        &quot;)
                      </span>
                    )}
                    <span className="c">
                      {call.brain_title ? ` · ${call.brain_title}` : ""}
                      {call.results !== null ? ` → ${call.results}` : ""}
                    </span>
                  </span>
                </div>
              ))}
            </section>
          )}
        </section>
      </>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  note,
  href,
}: {
  label: string;
  value: string;
  note?: string;
  href?: string;
}) {
  const body = (
    <>
      <span className="eyebrow" style={{ display: "block" }}>
        {label}
      </span>
      <span
        className="display"
        style={{ fontSize: "1.75rem", display: "block", marginTop: ".3rem", lineHeight: 1 }}
      >
        {value}
      </span>
      {note && (
        <span
          className="mono"
          style={{ display: "block", fontSize: ".6875rem", color: "var(--ink-3)", marginTop: ".35rem" }}
        >
          {note}
        </span>
      )}
    </>
  );

  const style: React.CSSProperties = { background: "var(--paper-2)", padding: "1rem 1.25rem" };
  return href ? (
    <Link href={href} style={style}>
      {body}
    </Link>
  ) : (
    <div style={style}>{body}</div>
  );
}

/** An empty screen is an invitation to act, not a shrug. */
function FirstRun() {
  return (
    <AppShell
      active="/brains"
      eyebrow="Nothing here yet"
      title="Start with one folder of screenshots."
    >
      <p style={{ color: "var(--ink-2)", maxWidth: "54ch", marginTop: 0 }}>
        Pick something you explain to an agent over and over — a UI you keep
        rebuilding, an API you keep re-reading, a convention nobody wrote down.
        Name what it&apos;s for, drop the material in, and connect it to your editor.
      </p>
      <div style={{ display: "flex", gap: ".75rem", marginTop: "1.75rem", flexWrap: "wrap" }}>
        <Link className="btn" href="/brains/new">
          Build the first one
        </Link>
        <Link className="btn btn-ghost" href="/guide">
          How to build a good one
        </Link>
        <Link className="btn btn-ghost" href="/explore">
          See public brains
        </Link>
      </div>
    </AppShell>
  );
}
