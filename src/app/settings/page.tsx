import Link from "next/link";
import { redirect } from "next/navigation";
import TopBar from "@/components/TopBar";
import { query } from "@/db";
import { currentUser } from "@/lib/session";

/**
 * Plan and usage. There is no checkout yet — upgrades are handled by hand while
 * we find out what people actually hit limits on. The quotas are real from day
 * one because they protect the API bill, not the revenue.
 */

const PLANS = {
  free: { brains: 1, sources: 50, calls: 300, write: false, exports: false },
  pro: { brains: 20, sources: 1000, calls: 10_000, write: true, exports: true },
  team: { brains: 100, sources: 5000, calls: 50_000, write: true, exports: true },
} as const;

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const limits = PLANS[user.plan];
  const [{ brains }, { sources }, { calls }] = await Promise.all([
    query<{ brains: number }>(
      `select count(*)::int as brains from brains where owner_id = $1`,
      [user.id],
    ).then((r) => r[0]),
    query<{ sources: number }>(
      `select count(*)::int as sources from sources s
         join brains b on b.id = s.brain_id where b.owner_id = $1`,
      [user.id],
    ).then((r) => r[0]),
    query<{ calls: number }>(
      `select count(*)::int as calls from calls
        where caller_id = $1 and created_at >= date_trunc('month', now())`,
      [user.id],
    ).then((r) => r[0]),
  ]);

  return (
    <>
      <TopBar />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)", maxWidth: 760 }}>
        <p className="eyebrow">{user.email}</p>
        <h1 className="display" style={{ fontSize: "clamp(2rem, 5vw, 3rem)", margin: ".4rem 0 2rem" }}>
          Plan and usage
        </h1>

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

          <Usage label="Brains" used={brains} limit={limits.brains} />
          <Usage label="Sources" used={sources} limit={limits.sources} />
          <Usage label="MCP calls this month" used={calls} limit={limits.calls} />
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
          <div className="panel" style={{ marginTop: "2rem" }}>
            <p className="eyebrow">Need more room</p>
            <h2 className="display" style={{ fontSize: "1.5rem", margin: ".5rem 0 .75rem" }}>
              Pro is handled by hand right now.
            </h2>
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

        <p style={{ marginTop: "2rem" }}>
          <Link className="navlink" href="/settings/tokens">
            Access tokens →
          </Link>
        </p>
      </main>
    </>
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
