import { translator } from "@/lib/t";
import { markup } from "@/lib/markup";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ShareForm from "./ShareForm";
import DeleteBrain from "./DeleteBrain";
import { createGiftLink, revokeGiftLink } from "./gift-actions";
import { maybeOne, query } from "@/db";
import type { Brain, Grant } from "@/db/types";
import { currentUser } from "@/lib/session";
import { limitsFor } from "@/lib/plans";
import { env } from "@/lib/env";

export default async function SharePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const t = await translator();

  const { slug } = await params;
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const brain = await maybeOne<Brain>(
    `select * from brains where owner_id = $1 and slug = $2`,
    [user.id, slug],
  );
  if (!brain) notFound();

  const grants = await query<Grant>(
    `select * from grants where brain_id = $1 order by invited_at desc`,
    [brain.id],
  );

  const gifts = await query<{ id: string; code: string; uses_left: number }>(
    `select id, code, uses_left from gift_links
      where brain_id = $1 order by created_at desc`,
    [brain.id],
  );

  return (
    <AppShell active="/brains" narrow>
        <Link className="eyebrow" href={`/brains/${brain.slug}`}>
          ← {brain.title}
        </Link>

        <h1 className="h1" style={{ margin: ".75rem 0 .5rem" }}>
          {t("Sharing")}</h1>
        {brain.visibility === "public" && user.handle && (
          <p className="mono" style={{ color: "var(--ink-2)", fontSize: ".8125rem" }}>
            {markup(t("Public at <0/>"), [
            <Link key="s0" href={`/b/${user.handle}/${brain.slug}`} style={{ textDecoration: "underline" }}> /b/{user.handle}/{brain.slug} </Link>,
          ])}</p>
        )}

        <div style={{ marginTop: "1.75rem" }}>
          <ShareForm brain={brain} grants={grants} />
        </div>

        <section style={{ marginTop: "2.5rem" }}>
          <h2 className="h2" style={{ marginBottom: ".5rem" }}>
            {t("Gift links")}</h2>
          <p style={{ color: "var(--ink-2)", marginTop: 0, maxWidth: "58ch" }}>
            {markup(t("A link with a few uses — for seeding a community or thanking someone. Each redeem grants read access <0/>, exactly like inviting them by email, and it works even on a paid brain — that is the point."), [
            brain.parent_id ? t("to this brain") : t("to this brain and its family"),
          ])}</p>

          {gifts.map((g) => (
            <div
              key={g.id}
              style={{ display: "flex", gap: "1rem", alignItems: "baseline", marginBottom: ".5rem" }}
            >
              <code className="mono" style={{ fontSize: ".8125rem", flex: 1, overflowWrap: "anywhere" }}>
                {env.NEXT_PUBLIC_APP_URL}/gift/{g.code}
              </code>
              <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)", flexShrink: 0 }}>
                {markup(
                  g.uses_left === 1 ? t("<0/> use left") : t("<0/> uses left"),
                  [g.uses_left],
                )}</span>
              <form action={revokeGiftLink}>
                <input type="hidden" name="id" value={g.id} />
                <input type="hidden" name="slug" value={brain.slug} />
                <button
                  className="mono"
                  style={{ background: "none", border: 0, padding: 0, textDecoration: "underline", cursor: "pointer", fontSize: ".75rem", color: "var(--color-riso-red)" }}
                >
                  {t("revoke")}</button>
              </form>
            </div>
          ))}

          <form action={createGiftLink} style={{ display: "flex", gap: ".6rem", alignItems: "center", marginTop: ".75rem" }}>
            <input type="hidden" name="slug" value={brain.slug} />
            <input
              name="uses"
              type="number"
              min={1}
              max={25}
              defaultValue={5}
              style={{ width: 80, padding: ".45rem .6rem", border: "1.5px solid var(--ink)", background: "var(--paper)", font: "inherit" }}
            />
            <button className="btn btn-ghost" style={{ padding: ".45rem .9rem" }}>
              {t("Make a gift link")}</button>
          </form>
        </section>

        <section style={{ marginTop: "2.5rem" }}>
          <h2 className="h2" style={{ marginBottom: ".5rem" }}>
            {t("Export")}</h2>
          <p style={{ color: "var(--ink-2)", marginTop: 0, maxWidth: "58ch" }}>
            {t("Take the brain with you. A file, once exported, keeps working with no server and no subscription — exporting it is the Pro part.")}</p>
          {limitsFor(user.plan).exports ? (
            <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
              {[
                ["claude", t("CLAUDE.md")],
                ["skill", t("Claude Skill")],
                ["agents", t("AGENTS.md")],
              ].map(([format, label]) => (
                <a
                  key={format}
                  className="btn btn-ghost"
                  href={`/api/brains/${brain.id}/export?format=${format}`}
                >
                  {label}
                </a>
              ))}
            </div>
          ) : (
            <p className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>
              {markup(t("🔒 CLAUDE.md · Claude Skill · AGENTS.md — <0>on the Pro plan</0> . Over MCP the brain stays fully readable on free."), [
              <Link href="/settings" style={{ textDecoration: "underline" }} key="s0" />,
            ])}</p>
          )}
        </section>

        <hr className="rule" style={{ margin: "3rem 0 0" }} />
        <DeleteBrain
          slug={brain.slug}
          title={brain.title}
          noteCount={brain.note_count}
        />
      </AppShell>
  );
}
