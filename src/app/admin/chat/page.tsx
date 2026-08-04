import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { query } from "@/db";
import { requireAdmin } from "@/lib/admin";
import { replyInChat, markThreadRead } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chat — mozg admin" };

/**
 * Every thread, unread first. Replying here lands in the user's /chat and,
 * because that page marks itself read, the loop closes without any of the
 * ticket-system ceremony this product does not need yet.
 */
export default async function AdminChatPage() {
  await requireAdmin().catch(() => redirect("/"));

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

  const bodies = new Map<string, { author: string; body: string; at: string }[]>();
  if (threads.length) {
    const msgs = await query<{ user_id: string; author: string; body: string; at: string }>(
      `select user_id, author, body,
              to_char(created_at at time zone 'UTC', 'MM-DD HH24:MI') as at
         from chat_messages
        where user_id = any($1::text[])
        order by created_at asc`,
      [threads.map((t) => t.user_id)],
    );
    for (const m of msgs) {
      bodies.set(m.user_id, [...(bodies.get(m.user_id) ?? []), m]);
    }
  }

  return (
    <AppShell active="/admin/chat" eyebrow="Operator" title="chatmozg">
      <p style={{ color: "var(--ink-2)", maxWidth: "62ch", marginTop: 0 }}>
        {threads.length} thread{threads.length === 1 ? "" : "s"} ·{" "}
        {threads.reduce((n, t) => n + t.unread, 0)} unread. The people who write
        here are the beta doing its job — answer like it.
      </p>

      {threads.map((t) => (
        <details
          key={t.user_id}
          open={t.unread > 0}
          style={{ border: "1.5px solid var(--ink)", background: "var(--paper-2)", marginBottom: "1rem" }}
        >
          <summary style={{ padding: ".7rem 1rem", cursor: "pointer", display: "flex", gap: "1rem", alignItems: "baseline" }}>
            <strong>{t.handle ?? t.email}</strong>
            {t.unread > 0 && (
              <span className="mono" style={{ fontSize: ".75rem", color: "var(--color-riso-red)" }}>
                {t.unread} new
              </span>
            )}
            <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", marginLeft: "auto" }}>
              {t.last_at}
            </span>
          </summary>

          <div style={{ borderTop: "1px solid var(--rule)" }}>
            {(bodies.get(t.user_id) ?? []).map((m, i) => (
              <div
                key={i}
                style={{
                  padding: ".6rem 1rem",
                  borderBottom: "1px solid var(--rule)",
                  borderLeft: m.author === "operator" ? "3px solid var(--color-riso-green)" : "3px solid transparent",
                }}
              >
                <p className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)", margin: "0 0 .2rem" }}>
                  {m.author === "operator" ? "you" : t.email} · {m.at}
                </p>
                <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: ".9375rem" }}>{m.body}</p>
              </div>
            ))}

            <form action={replyInChat} style={{ display: "grid", gap: ".5rem", padding: ".8rem 1rem" }}>
              <input type="hidden" name="user_id" value={t.user_id} />
              <textarea
                name="body"
                rows={2}
                required
                placeholder="Reply — lands in their /chat instantly"
                style={{ width: "100%", padding: ".55rem .7rem", border: "1.5px solid var(--ink)", background: "var(--paper)", font: "inherit", fontSize: ".875rem" }}
              />
              <div style={{ display: "flex", gap: ".6rem" }}>
                <button className="btn" style={{ padding: ".4rem .8rem" }}>Reply</button>
                {t.unread > 0 && (
                  <button formAction={markThreadRead} className="btn btn-ghost" style={{ padding: ".4rem .8rem" }}>
                    Mark read
                  </button>
                )}
              </div>
            </form>
          </div>
        </details>
      ))}
    </AppShell>
  );
}
