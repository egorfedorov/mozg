import { translator } from "@/lib/t";
import { markup } from "@/lib/markup";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import AutoRefresh from "@/components/AutoRefresh";
import { query } from "@/db";
import { requireAdmin } from "@/lib/admin";
import { translateThreadsForOperator } from "@/lib/operator-chat";
import { REPLY_LANGS } from "@/lib/translate";
import { replyInChat, markThreadRead } from "./actions";
import { messageUser } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chat — mozg admin" };

/**
 * Every thread, unread first. Replying here lands in the user's /chat and,
 * because that page marks itself read, the loop closes without any of the
 * ticket-system ceremony this product does not need yet.
 */
export default async function AdminChatPage() {
  const t = await translator();

  await requireAdmin().catch(() => redirect("/"));

  // Fill missing Russian translations before reading the thread — each
  // message is translated exactly once, so steady-state this is a no-op.
  await translateThreadsForOperator();

  // Everyone, for the write-first picker. lazy: a <select> holds fine at beta
  // scale; swap for a search box past a few hundred accounts.
  const people = await query<{ id: string; email: string; handle: string | null }>(
    `select id, email, handle from "user" order by "createdAt" desc`,
  );

  const threads = await query<{
    user_id: string;
    email: string;
    handle: string | null;
    unread: number;
    last_at: string;
    last_body: string;
  }>(
    `select m.user_id, u.email, u.handle,
            count(*) filter (where m.author = 'user' and m.read_at is null)::int as unread,
            to_char(max(m.created_at) at time zone 'UTC', 'MM-DD HH24:MI') as last_at,
            (select body from chat_messages m2
              where m2.user_id = m.user_id order by created_at desc limit 1) as last_body
       from chat_messages m join "user" u on u.id = m.user_id
      group by m.user_id, u.email, u.handle
      order by 4 desc, max(m.created_at) desc`,
  );

  const bodies = new Map<
    string,
    { author: string; body: string; at: string; translation: string | null; source_body: string | null }[]
  >();
  if (threads.length) {
    const msgs = await query<{
      user_id: string;
      author: string;
      body: string;
      at: string;
      translation: string | null;
      source_body: string | null;
    }>(
      `select user_id, author, body, translation, source_body,
              to_char(created_at at time zone 'UTC', 'MM-DD HH24:MI') as at
         from chat_messages
        where user_id = any($1::text[])
        order by created_at asc`,
      [threads.map((thread) => thread.user_id)],
    );
    for (const m of msgs) {
      bodies.set(m.user_id, [...(bodies.get(m.user_id) ?? []), m]);
    }
  }

  return (
    <AppShell active="/admin/chat" eyebrow={t("Operator")} title="chatmozg">
      <p style={{ color: "var(--ink-2)", maxWidth: "62ch", marginTop: 0 }}>
        {markup(t("<0/> thread<1/> · <2/> unread. The people who write here are the beta doing its job — answer like it. <3/>"), [
        threads.length,
        threads.length === 1 ? "" : "s",
        threads.reduce((n, thread) => n + thread.unread, 0),
        <AutoRefresh key="s3" active intervalMs={20_000} label={t("live — new messages appear without reloading")} />,
      ])}</p>

      {/* Speak first: pick anyone, not only people who already wrote. The new
          thread appears below and in their mascot the moment it sends. */}
      <details
        style={{ border: "1.5px solid var(--ink)", background: "var(--paper-2)", marginBottom: "1.5rem" }}
      >
        <summary style={{ padding: ".7rem 1rem", cursor: "pointer" }}>
          <strong>{t("New thread")}</strong>
          <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", marginLeft: ".75rem" }}>
            {t("write to someone first")}</span>
        </summary>
        <form
          action={messageUser}
          style={{ display: "grid", gap: ".5rem", padding: ".8rem 1rem", borderTop: "1px solid var(--rule)" }}
        >
          <select
            name="user_id"
            required
            defaultValue=""
            style={{ font: "inherit", border: "1.5px solid var(--ink)", background: "var(--paper)", padding: ".45rem .6rem", maxWidth: "24rem" }}
          >
            <option value="" disabled>
              {t("who…")}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.handle ? `${p.handle} · ${p.email}` : p.email}
              </option>
            ))}
          </select>
          <textarea
            name="body"
            rows={2}
            required
            placeholder={t("Пиши по-русски — уйдёт на языке собеседника")}
            style={{ width: "100%", padding: ".55rem .7rem", border: "1.5px solid var(--ink)", background: "var(--paper)", font: "inherit", fontSize: ".875rem" }}
          />
          <div style={{ display: "flex", gap: ".6rem", alignItems: "center" }}>
            <button className="btn" style={{ padding: ".4rem .8rem" }}>{t("Send")}</button>
            <label className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", display: "flex", gap: ".35rem", alignItems: "center" }}>
              {t("send in")}
              <select name="lang" defaultValue="auto" style={{ font: "inherit", border: "1.5px solid var(--ink)", background: "var(--paper)", padding: ".2rem .3rem" }}>
                {REPLY_LANGS.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </label>
          </div>
        </form>
      </details>

      {threads.map((thread) => (
        <details
          key={thread.user_id}
          open={thread.unread > 0}
          style={{ border: "1.5px solid var(--ink)", background: "var(--paper-2)", marginBottom: "1rem" }}
        >
          <summary style={{ padding: ".7rem 1rem", cursor: "pointer", display: "flex", gap: "1rem", alignItems: "baseline" }}>
            <strong>{thread.handle ?? thread.email}</strong>
            {thread.unread > 0 && (
              <span className="mono" style={{ fontSize: ".75rem", color: "var(--color-riso-red)" }}>
                {markup(t("<0/> new"), [
                thread.unread,
              ])}</span>
            )}
            <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", marginLeft: "auto" }}>
              {thread.last_at}
            </span>
          </summary>

          <div style={{ borderTop: "1px solid var(--rule)" }}>
            {(bodies.get(thread.user_id) ?? []).map((m, i) => (
              <div
                key={i}
                style={{
                  padding: ".6rem 1rem",
                  borderBottom: "1px solid var(--rule)",
                  borderLeft: m.author === "operator" ? "3px solid var(--color-riso-green)" : "3px solid transparent",
                }}
              >
                <p className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)", margin: "0 0 .2rem" }}>
                  {m.author === "operator" ? "you" : thread.email} · {m.at}
                </p>
                <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: ".9375rem" }}>{m.body}</p>
                {/* Their message, rendered into Russian — shown only when it
                    actually differs from the original. */}
                {m.author === "user" && m.translation && m.translation !== m.body && (
                  <p style={{ margin: ".35rem 0 0", whiteSpace: "pre-wrap", fontSize: ".875rem", color: "var(--ink-2)", borderLeft: "2px solid var(--rule)", paddingLeft: ".6rem" }}>
                    {m.translation}
                  </p>
                )}
                {/* What you actually typed, when the wire carried a translation. */}
                {m.author === "operator" && m.source_body && (
                  <p style={{ margin: ".35rem 0 0", whiteSpace: "pre-wrap", fontSize: ".875rem", color: "var(--ink-3)", borderLeft: "2px solid var(--rule)", paddingLeft: ".6rem" }}>
                    {m.source_body}
                  </p>
                )}
              </div>
            ))}

            <form action={replyInChat} style={{ display: "grid", gap: ".5rem", padding: ".8rem 1rem" }}>
              <input type="hidden" name="user_id" value={thread.user_id} />
              <textarea
                name="body"
                rows={2}
                required
                placeholder={t("Reply — lands in their /chat instantly")}
                style={{ width: "100%", padding: ".55rem .7rem", border: "1.5px solid var(--ink)", background: "var(--paper)", font: "inherit", fontSize: ".875rem" }}
              />
              <div style={{ display: "flex", gap: ".6rem", alignItems: "center" }}>
                <button className="btn" style={{ padding: ".4rem .8rem" }}>{t("Reply")}</button>
                <label className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", display: "flex", gap: ".35rem", alignItems: "center" }}>
                  {t("send in")}
                  <select name="lang" defaultValue="auto" style={{ font: "inherit", border: "1.5px solid var(--ink)", background: "var(--paper)", padding: ".2rem .3rem" }}>
                    {REPLY_LANGS.map((l) => (
                      <option key={l.code} value={l.code}>{l.label}</option>
                    ))}
                  </select>
                </label>
                {thread.unread > 0 && (
                  <button formAction={markThreadRead} className="btn btn-ghost" style={{ padding: ".4rem .8rem" }}>
                    {t("Mark read")}</button>
                )}
              </div>
            </form>
          </div>
        </details>
      ))}
    </AppShell>
  );
}
