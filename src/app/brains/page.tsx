import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import AppShell from "@/components/AppShell";
import BrainCard from "@/components/BrainCard";
import QuickStart from "@/components/QuickStart";
import { Section, Stats, Stat, Rows, Row } from "@/components/ui";
import { currentUser } from "@/lib/session";
import { listBrains } from "@/lib/brains";
import { dashboardStats, needsAttention, recentActivity } from "@/lib/dashboard";
import { formatCents } from "@/lib/money-math";

export const dynamic = "force-dynamic";

export const metadata = { title: "Your brains — mozg" };

const ATTENTION: Record<string, { tint: "red" | "blue" | "violet" | "orange"; action: string }> = {
  flagged: { tint: "red", action: "Look" },
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

  // A brand-new account meets the onboarding once. The cookie is set by
  // /welcome itself, so skipping it there means never being sent back.
  if (!brains.length && !(await cookies()).get("mozg-welcomed")) {
    redirect("/welcome");
  }

  if (!brains.length) return <FirstRun />;

  const trend = stats.callsWeek - stats.callsPrevWeek;

  // Parents first, each with its children. A child whose parent was deleted
  // falls back to standing on its own rather than disappearing.
  const byId = new Map(brains.map((b) => [b.id, b]));
  const families: [(typeof brains)[number], typeof brains][] = brains
    .filter((b) => !b.parent_id || !byId.has(b.parent_id))
    .map((parent) => [parent, brains.filter((b) => b.parent_id === parent.id)]);

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
          {/* Families are rendered as families: a parent with its children
              indented under it, because that is how the owner thinks about
              them and how an agent is told they behave. */}
          {families.map(([parent, children]) => (
            <div key={parent.id} style={{ marginBottom: "1.5rem" }}>
              {children.length > 0 && (
                <p className="eyebrow" style={{ marginBottom: ".5rem" }}>
                  {parent.title} · {children.length} inside · searching the parent
                  searches all of them
                </p>
              )}
              <div className="grid-brains">
                <BrainCard brain={parent} />
                {children.map((child) => (
                  <BrainCard key={child.id} brain={child} />
                ))}
              </div>
            </div>
          ))}

          <div className="grid-brains">
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
      title="Give your agents a brain."
      narrow
    >
      <p className="lede">
        Pick something your agents keep getting wrong — an API you keep
        re-reading, docs newer than the model, a convention nobody wrote down —
        and feed it in. One link is enough to start.
      </p>

      <div style={{ marginTop: "1.75rem" }}>
        <QuickStart />
      </div>

      <div style={{ display: "flex", gap: ".75rem", marginTop: "1rem", flexWrap: "wrap" }}>
        <Link className="btn btn-ghost" href="/brains/new">
          Or build one by hand
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
