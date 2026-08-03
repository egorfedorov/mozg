import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import BrainCard from "@/components/BrainCard";
import { Section, Stats, Stat, Rows, Row } from "@/components/ui";
import { currentUser } from "@/lib/session";
import { listBrains } from "@/lib/brains";
import { dashboardStats, needsAttention, recentActivity } from "@/lib/dashboard";
import { formatCents } from "@/lib/money-math";

export const dynamic = "force-dynamic";

export const metadata = { title: "Your brains — mozg" };

const ATTENTION: Record<string, { tint: "red" | "blue" | "violet" | "orange"; action: string }> = {
  review: { tint: "violet", action: "Review" },
  failed: { tint: "red", action: "Look" },
  "no-goal": { tint: "orange", action: "Set a goal" },
  unexamined: { tint: "orange", action: "Run it" },
  gap: { tint: "blue", action: "Add sources" },
  unreachable: { tint: "red", action: "Check it" },
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
      <div className="stack">
        {/* Numbers that change what you do, not vanity counters. */}
        <Stats>
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
        </Stats>

        {attention.length > 0 && (
          <Section
            title="Needs you"
            aside={`${attention.length} thing${attention.length === 1 ? "" : "s"}`}
          >
            <Rows>
              {attention.slice(0, 8).map((item, i) => (
                <Row
                  key={`${item.kind}-${item.brainSlug}-${i}`}
                  href={item.href}
                  tint={ATTENTION[item.kind].tint}
                  title={item.brainTitle}
                  sub={item.detail}
                  side={`${ATTENTION[item.kind].action} →`}
                />
              ))}
            </Rows>
          </Section>
        )}

        <Section title="All brains" aside={`${brains.length} in total`}>
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
        </Section>

        <Section title="What your agents did" aside="across every brain">
          {activity.length === 0 ? (
            <Rows
              empty={
                <>
                  Nothing yet. Once a brain is connected, every tool call an agent
                  makes shows up here — the fastest way to see whether it is
                  actually being read.{" "}
                  <Link href="/connect" style={{ textDecoration: "underline" }}>
                    Connect one
                  </Link>
                  .
                </>
              }
            />
          ) : (
            <section className="term">
              <div className="term-bar">
                <span className="term-dot" />
                <span className="term-dot" />
                <span className="term-dot" />
                <span style={{ marginLeft: ".5rem" }}>live from your agents</span>
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
        </Section>
      </div>
    </AppShell>
  );
}

/** An empty screen is an invitation to act, not a shrug. */
function FirstRun() {
  return (
    <AppShell
      active="/brains"
      eyebrow="Nothing here yet"
      title="Start with one folder of screenshots."
      narrow
    >
      <p className="lede">
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
