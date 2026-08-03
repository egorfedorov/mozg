import Link from "next/link";
import { redirect } from "next/navigation";
import { query } from "@/db";
import { currentUser } from "@/lib/session";
import AppShell from "@/components/AppShell";
import ProfileForm from "./ProfileForm";
import { limitsFor } from "@/lib/plans";

export const dynamic = "force-dynamic";

export const metadata = { title: "Account — mozg" };

/**
 * Plan and usage. There is no checkout yet — upgrades are handled by hand while
 * we find out what people actually hit limits on. The quotas are real from day
 * one because they protect the API bill, not the revenue.
 */

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/settings");

  const limits = limitsFor(user.plan);
  const [counts] = await query<{
    brains: number;
    sources: number;
    calls: number;
    balance_cents: number;
  }>(
    `select
       (select count(*)::int from brains where owner_id = $1) as brains,
       (select count(*)::int from sources s join brains b on b.id = s.brain_id
         where b.owner_id = $1) as sources,
       (select count(*)::int from calls
         where caller_id = $1 and created_at >= date_trunc('month', now())) as calls,
       (select balance_cents from "user" where id = $1) as balance_cents`,
    [user.id],
  );

  return (
    <AppShell active="/settings" eyebrow={user.email} title="Plan & profile">
      <section>
        <h2 className="h2" style={{ marginBottom: ".75rem" }}>
          Profile
        </h2>
        <ProfileForm name={user.name ?? ""} handle={user.handle ?? ""} />
      </section>

      <section style={{ marginTop: "2.5rem" }}>
        <h2 className="h2" style={{ marginBottom: ".75rem" }}>
          Plan and usage
        </h2>

        <div className="scorecard">
          <div className="score-head">
            <div>
              <p className="eyebrow" style={{ marginBottom: ".35rem" }}>
                Current plan
              </p>
              <span className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>
                resets on the 1st
              </span>
            </div>
            <div className="score-big" style={{ textTransform: "lowercase" }}>
              {user.plan}
            </div>
          </div>

          <Usage label="Brains" used={counts.brains} limit={limits.brains} />
          <Usage label="Sources" used={counts.sources} limit={limits.sources} />
          <Usage label="MCP calls this month" used={counts.calls} limit={limits.calls} />
          <div className="score-row" data-state={limits.write ? "pass" : "fail"}>
            <span className="sig">{limits.write ? "✓" : "✕"}</span>
            <span>Agents can write back</span>
            <span className="count">{limits.write ? "on" : "Pro"}</span>
          </div>
          <div className="score-row" data-state={limits.exports ? "pass" : "fail"}>
            <span className="sig">{limits.exports ? "✓" : "✕"}</span>
            <span>Export to CLAUDE.md, Skill, AGENTS.md</span>
            <span className="count">{limits.exports ? "on" : "Pro"}</span>
          </div>
        </div>

        {user.plan === "free" && (
          <div className="panel" style={{ marginTop: "1.5rem" }}>
            <p className="eyebrow">Need more room</p>
            <h3 className="h2" style={{ margin: ".4rem 0 .6rem" }}>
              Pro is handled by hand right now.
            </h3>
            <p style={{ color: "var(--ink-2)", marginTop: 0 }}>
              There is no checkout yet — we are still finding out which limit people
              hit first. Email what you are building and we will switch your account
              over the same day.
            </p>
            <a className="btn" href="mailto:hi@mozg.sh?subject=Pro%20access" style={{ marginTop: "1rem" }}>
              Ask for Pro
            </a>
          </div>
        )}
      </section>

      <section style={{ marginTop: "2.5rem" }}>
        <h2 className="h2" style={{ marginBottom: ".5rem" }}>
          Connecting an agent
        </h2>
        <p style={{ color: "var(--ink-2)", marginTop: 0, maxWidth: "60ch" }}>
          One token works across every brain you can reach. The setup lines for
          Claude Code, Codex, Cursor, Kimi and the rest are on the connect page.
        </p>
        <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
          <Link className="btn" href="/settings/tokens">
            Your tokens
          </Link>
          <Link className="btn btn-ghost" href="/connect">
            How to connect
          </Link>
        </div>
      </section>
    </AppShell>
  );
}

function Usage({ label, used, limit }: { label: string; used: number; limit: number }) {
  const ratio = limit ? used / limit : 0;
  const state = ratio >= 1 ? "fail" : ratio >= 0.8 ? "partial" : "pass";
  return (
    <div className="score-row" data-state={state}>
      <span className="sig">{state === "fail" ? "✕" : state === "partial" ? "▲" : "✓"}</span>
      <span>{label}</span>
      <span className="count">
        {used.toLocaleString()} / {limit.toLocaleString()}
      </span>
    </div>
  );
}
