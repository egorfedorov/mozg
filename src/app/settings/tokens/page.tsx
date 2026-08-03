import { redirect } from "next/navigation";
import TopBar from "@/components/TopBar";
import TokenForm from "./TokenForm";
import { query } from "@/db";
import type { McpToken } from "@/db/types";
import { currentUser } from "@/lib/session";
import { quotaRemaining } from "@/lib/tokens";
import { revoke } from "./actions";

export default async function TokensPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const [tokens, remaining, used] = await Promise.all([
    query<McpToken>(
      `select * from mcp_tokens where user_id = $1 and revoked_at is null
        order by created_at desc`,
      [user.id],
    ),
    quotaRemaining(user.id, user.plan),
    query<{ n: number }>(
      `select count(*)::int as n from calls
        where caller_id = $1 and created_at >= date_trunc('month', now())`,
      [user.id],
    ).then((r) => r[0]?.n ?? 0),
  ]);

  return (
    <>
      <TopBar active="tokens" />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)", maxWidth: 860 }}>
        <p className="eyebrow">
          {used} calls this month · {remaining} left on {user.plan}
        </p>
        <h1 className="display" style={{ fontSize: "clamp(2rem, 5vw, 3rem)", margin: ".4rem 0 1.5rem" }}>
          Access tokens
        </h1>
        <p style={{ color: "var(--ink-2)", maxWidth: "60ch", marginTop: 0 }}>
          One token per machine. Each token can reach every brain you own or have
          been given access to. Revoking one takes effect on the next call.
        </p>

        <TokenForm />

        {tokens.length > 0 && (
          <div className="panel" style={{ padding: 0, marginTop: "2rem" }}>
            {tokens.map((t) => (
              <div
                key={t.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  gap: "1rem",
                  alignItems: "center",
                  padding: ".8rem 1.25rem",
                  borderBottom: "1px solid var(--rule)",
                }}
              >
                <span>
                  <span className="mono">{t.prefix}…</span>
                  {t.name && <span style={{ color: "var(--ink-2)" }}> · {t.name}</span>}
                </span>
                <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>
                  {t.last_used_at
                    ? `used ${new Date(t.last_used_at).toISOString().slice(0, 10)}`
                    : "never used"}
                </span>
                <form action={revoke}>
                  <input type="hidden" name="id" value={t.id} />
                  <button
                    className="mono"
                    style={{
                      background: "none",
                      border: 0,
                      padding: 0,
                      color: "var(--color-riso-red)",
                      fontSize: ".8125rem",
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    revoke
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
