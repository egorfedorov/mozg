import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { Section, Rows, Row } from "@/components/ui";
import TokenForm from "./TokenForm";
import { query } from "@/db";
import type { McpToken } from "@/db/types";
import { currentUser } from "@/lib/session";
import { quotaRemaining } from "@/lib/tokens";
import { revoke } from "./actions";
import ConfirmForm from "@/components/ConfirmForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Tokens — mozg" };

export default async function TokensPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/settings/tokens");

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
    <AppShell
      active="/settings/tokens"
      eyebrow={`${used} calls this month · ${remaining} left on ${user.plan}`}
      title="Access tokens"
      narrow
    >
      <div className="stack">
        <div>
          <p className="lede">
            One token per machine. Each token can reach every brain you own or
            have been given access to. Revoking one takes effect on the next call.
          </p>
          <TokenForm />
        </div>

        {tokens.length > 0 && (
          <Section title="Live tokens" aside={`${tokens.length} active`}>
            <Rows>
              {tokens.map((t) => (
                <Row
                  key={t.id}
                  title={`${t.prefix}…`}
                  sub={t.name ?? undefined}
                  meta={
                    t.last_used_at
                      ? `last used ${new Date(t.last_used_at).toISOString().slice(0, 10)}`
                      : "never used"
                  }
                  side={
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
                  }
                />
              ))}
            </Rows>
          </Section>
        )}
      </div>
    </AppShell>
  );
}
