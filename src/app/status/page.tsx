import Link from "next/link";
import { markup } from "@/lib/markup";
import { translator } from "@/lib/t";
import { msg } from "@/lib/msg";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import AutoRefresh from "@/components/AutoRefresh";
import { query } from "@/db";
import { systemStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Status — mozg",
  description:
    "Live status of every mozg service: the website, the database, semantic search, the reading queue, AI reading, the agent API and payments.",
};

const WORD: Record<string, string> = {
  ok: msg("All systems operational"),
  degraded: msg("Partially degraded"),
  down: msg("Major outage"),
};

/**
 * The page you open when something feels slow.
 *
 * Every light has its number next to it, because a green dot on its own is a
 * promise and a count is evidence. Nothing here is hand-flipped by an
 * operator: each state is computed from the same rows the product writes while
 * working, so the page cannot say "operational" through an outage nobody
 * noticed.
 *
 * Public, so it holds no totals a competitor could bank — ratios and queue
 * depths, never how many brains or people exist.
 */
export default async function StatusPage() {
  const t = await translator();

  const status = await systemStatus();

  // Deploys are the honest incident history of a small product: almost every
  // wobble on this page starts as one. Nothing is written for the page — it
  // reads the changelog the product already keeps.
  const shipped = await query<{ kind: string; title: string; at: string; live: boolean }>(
    `select kind, title,
            to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as at,
            (starts_at <= now() and (ends_at is null or ends_at > now())) as live
       from announcements
      where published
      order by created_at desc limit 5`,
  ).catch(() => []);

  return (
    <>
      <TopBar />
      <Contents active="/status" />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">{t("Status")}</p>

        <h1
          className="display"
          style={{
            fontSize: "clamp(1.8rem, 5vw, 3.2rem)",
            margin: ".4rem 0 1rem",
            display: "flex",
            alignItems: "center",
            gap: ".75rem",
            flexWrap: "wrap",
          }}
        >
          <span
            className="dot"
            data-state={status.state === "ok" ? undefined : "down"}
            style={{ width: "1rem", height: "1rem" }}
          />
          {t(WORD[status.state])}
        </h1>

        <p className="lede" style={{ maxWidth: "58ch" }}>
          {markup(t("Measured, not declared. Every line below is a live count taken when you loaded this page. <0/>"), [
          <AutoRefresh key="s0" active intervalMs={60_000} label="live" />,
        ])}</p>

        <div className="rows" style={{ maxWidth: "48rem", marginTop: "1.5rem" }}>
          {status.services.map((s) => (
            <div
              key={s.key}
              className="row"
              data-tint={s.state === "down" ? "red" : s.state === "degraded" ? "orange" : undefined}
            >
              <span style={{ minWidth: 0 }}>
                <strong style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                  <span
                    className="dot"
                    data-state={s.state === "ok" ? undefined : s.state === "down" ? "down" : "idle"}
                  />
                  {s.label}
                </strong>
                <span className="row-sub">{s.blurb}</span>
                <span className="row-meta">{s.detail}</span>
              </span>
              <span className="row-side mono" style={{ fontSize: ".75rem" }}>
                {s.state === "ok" ? "operational" : s.state}
              </span>
            </div>
          ))}
        </div>

        <section style={{ marginTop: "2.5rem", maxWidth: "48rem" }}>
          <div className="section-head">
            <h2 className="h2">{t("Notices & deploys")}</h2>
            <span className="eyebrow">{t("most wobbles start as one")}</span>
          </div>
          <div className="rows">
            {shipped.length === 0 ? (
              <p className="row-empty">
                {markup(t("Nothing announced yet — the <0>changelog</0> has the full history."), [
                <Link href="/changelog" style={{ textDecoration: "underline" }} key="s0" />,
              ])}</p>
            ) : (
              shipped.map((s, i) => (
                <div
                  key={i}
                  className="row"
                  data-tint={s.live && s.kind === "maintenance" ? "orange" : undefined}
                >
                  <span style={{ minWidth: 0 }}>
                    <strong>{s.title}</strong>
                    <span className="row-meta">
                      {s.kind}
                      {s.live && s.kind === "maintenance" ? t(" · in progress") : ""} · {s.at}
                    </span>
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <p className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-3)", marginTop: "2rem" }}>
          {markup(t("Machine-readable: <0>/api/health</0> — 200 while serving, 503 when it is not. Point a monitor at it."), [
          <a href="/api/health" style={{ textDecoration: "underline" }} key="s0" />,
        ])}</p>

        <p style={{ color: "var(--ink-2)", maxWidth: "58ch" }}>
          {markup(t("Something broken that this page calls operational? <0>Tell us in chat</0> — a lane nobody measures is exactly the one that fails quietly."), [
          <Link href="/chat" style={{ textDecoration: "underline" }} key="s0" />,
        ])}</p>
      </main>

      <SiteFooter />
    </>
  );
}
