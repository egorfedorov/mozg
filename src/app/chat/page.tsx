import { translator } from "@/lib/t";
import { markup } from "@/lib/markup";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import AutoRefresh from "@/components/AutoRefresh";
import { query } from "@/db";
import { currentUser } from "@/lib/session";
import ChatForm from "./ChatForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "chatmozg — mozg" };

/**
 * The line to the developer — a thread, not a mailto. The product's whole
 * audience lives in chat windows; making them open a mail client to report
 * a bug was a tax on exactly the people we most want to hear from.
 */
export default async function ChatPage() {
  const t = await translator();

  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/chat");

  const messages = await query<{
    id: string;
    author: "user" | "operator";
    body: string;
    at: string;
  }>(
    `select id, author, body,
            to_char(created_at at time zone 'UTC', 'MM-DD HH24:MI') as at
       from chat_messages where user_id = $1
      order by created_at asc limit 200`,
    [user.id],
  );

  // Operator replies the reader has now seen stop counting as unread.
  await query(
    `update chat_messages set read_at = now()
      where user_id = $1 and author = 'operator' and read_at is null`,
    [user.id],
  );

  return (
    <AppShell active="/chat" eyebrow={t("A human answers — usually same day")} title="chatmozg">
      <p style={{ color: "var(--ink-2)", maxWidth: "62ch", marginTop: 0 }}>
        {t("Straight line to the person who builds this. Bugs with steps, ideas with reasons, brains you wish existed — substance in, answers out.")}</p>

      <div className="panel" style={{ padding: 0, marginBottom: "1.25rem" }}>
        {messages.length === 0 ? (
          <p style={{ padding: "1rem 1.25rem", color: "var(--ink-2)", margin: 0 }}>
            {t("Nothing yet — yours will be the first message in this thread.")}</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              style={{
                padding: ".8rem 1.25rem",
                borderBottom: "1px solid var(--rule)",
                borderLeft:
                  m.author === "operator"
                    ? "3px solid var(--color-riso-green)"
                    : "3px solid transparent",
              }}
            >
              <p className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)", margin: "0 0 .25rem" }}>
                {markup(t("<0/> · <1/> UTC"), [
                m.author === "operator" ? "mozg" : "you",
                m.at,
              ])}</p>
              <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: ".9375rem" }}>{m.body}</p>
            </div>
          ))
        )}
      </div>

      <ChatForm />
      <div style={{ marginTop: ".75rem" }}>
        <AutoRefresh active intervalMs={20_000} label={t("live — replies appear without reloading")} />
      </div>
    </AppShell>
  );
}
