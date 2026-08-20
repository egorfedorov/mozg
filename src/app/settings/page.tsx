import { translator } from "@/lib/t";
import Link from "next/link";
import { redirect } from "next/navigation";
import { query } from "@/db";
import { currentUser } from "@/lib/session";
import AppShell from "@/components/AppShell";
import ProfileForm from "./ProfileForm";
import PlanPanel from "./PlanPanel";
import AiKeyPanel from "./AiKeyPanel";
import { limitsFor, upgradesFrom } from "@/lib/plans";
import { pendingPlanRequest } from "@/lib/upgrade";
import { env } from "@/lib/env";
import PushToggle from "@/components/PushToggle";
import { fill } from "@/lib/markup";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await translator();
  return { title: t("Account — mozg") };
}

/**
 * Plan and usage. Upgrades are a month at a time, two doors: pay from the
 * balance (instant) or ask (an operator switches the account by hand). The
 * quotas are real from day one because they protect the API bill, not the
 * revenue.
 */

export default async function SettingsPage() {
  const t = await translator();

  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/settings");

  const limits = limitsFor(user.plan);
  const [counts] = await query<{
    brains: number;
    sources: number;
    calls: number;
    balance_cents: number;
    ai_key_hint: string | null;
    ai_base_url: string | null;
    ai_provider: "anthropic" | "openai";
    ai_model: string | null;
  }>(
    `select
       (select count(*)::int from brains where owner_id = $1) as brains,
       (select count(*)::int from sources s join brains b on b.id = s.brain_id
         where b.owner_id = $1) as sources,
       (select count(*)::int from calls
         where caller_id = $1 and created_at >= date_trunc('month', now())) as calls,
       (select balance_cents from "user" where id = $1) as balance_cents,
       (select ai_key_hint from "user" where id = $1) as ai_key_hint,
       (select ai_base_url from "user" where id = $1) as ai_base_url,
       (select ai_provider from "user" where id = $1) as ai_provider,
       (select ai_model from "user" where id = $1) as ai_model`,
    [user.id],
  );

  const pending = await pendingPlanRequest(user.id);
  // Only plans strictly above the current one — see lib/plans.ts, which owns
  // the order so this page cannot forget a tier again.
  const targets = upgradesFrom(user.plan);

  return (
    <AppShell active="/settings" eyebrow={user.email} title={t("Plan & profile")}>
      <section>
        <h2 className="h2" style={{ marginBottom: ".75rem" }}>
          {t("Profile")}</h2>
        <ProfileForm name={user.name ?? ""} handle={user.handle ?? ""} />
      </section>

      {env.VAPID_PUBLIC_KEY && (
        <section style={{ marginTop: "2.5rem" }}>
          <h2 className="h2" style={{ marginBottom: ".5rem" }}>
            {t("Notifications")}</h2>
          <p style={{ color: "var(--ink-2)", marginTop: 0, maxWidth: "58ch" }}>
            {t("A browser notification when mozg replies to you in chatmozg — even with the site closed. Per browser; works in Chrome, Safari 16.4+ and Firefox.")}</p>
          <PushToggle
            vapidPublicKey={env.VAPID_PUBLIC_KEY}
            enabledNote="✓ this browser gets notified when mozg replies"
          />
        </section>
      )}

      <section style={{ marginTop: "2.5rem" }}>
        <h2 className="h2" style={{ marginBottom: ".75rem" }}>
          {t("Plan and usage")}</h2>

        <div className="scorecard">
          <div className="score-head">
            <div>
              <p className="eyebrow" style={{ marginBottom: ".35rem" }}>
                {t("Current plan")}</p>
              <span className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>
                {user.paidUntil
                  ? fill(t("paid until <0/>"), [new Date(user.paidUntil).toISOString().slice(0, 10)])
                  : t("resets on the 1st")}
              </span>
            </div>
            <div className="score-big" style={{ textTransform: "lowercase" }}>
              {user.plan}
            </div>
          </div>

          <Usage label={t("Brains")} used={counts.brains} limit={limits.brains} />
          <Usage label={t("Sources")} used={counts.sources} limit={limits.sources} />
          <Usage label={t("MCP calls this month")} used={counts.calls} limit={limits.calls} />
          <div className="score-row" data-state={limits.write ? "pass" : "fail"}>
            <span className="sig">{limits.write ? "✓" : "✕"}</span>
            <span>{t("Agents can write back")}</span>
            <span className="count">{limits.write ? "on" : t("Pro")}</span>
          </div>
          <div className="score-row" data-state={limits.exports ? "pass" : "fail"}>
            <span className="sig">{limits.exports ? "✓" : "✕"}</span>
            <span>{t("Export to CLAUDE.md, Skill, AGENTS.md")}</span>
            <span className="count">{limits.exports ? "on" : t("Pro")}</span>
          </div>
        </div>

        <PlanPanel
          balanceCents={counts.balance_cents}
          pending={
            pending ? { plan: pending.plan, createdAt: pending.created_at.toISOString() } : null
          }
          targets={targets}
        />

        <AiKeyPanel hint={counts.ai_key_hint} baseUrl={counts.ai_base_url} provider={counts.ai_provider} model={counts.ai_model} />
      </section>

      <section style={{ marginTop: "2.5rem" }}>
        <h2 className="h2" style={{ marginBottom: ".5rem" }}>
          {t("Connecting an agent")}</h2>
        <p style={{ color: "var(--ink-2)", marginTop: 0, maxWidth: "60ch" }}>
          {t("One token works across every brain you can reach. The setup lines for Claude Code, Codex, Cursor, Kimi and the rest are on the connect page.")}</p>
        <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
          <Link className="btn" href="/settings/tokens">
            {t("Your tokens")}</Link>
          <Link className="btn btn-ghost" href="/connect">
            {t("How to connect")}</Link>
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
