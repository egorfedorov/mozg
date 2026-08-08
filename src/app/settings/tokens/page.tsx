import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { Section, Rows, Row } from "@/components/ui";
import TokenForm from "./TokenForm";
import IchiTokenForm from "./IchiTokenForm";
import { query } from "@/db";
import type { McpToken } from "@/db/types";
import { currentUser } from "@/lib/session";
import { quotaRemaining } from "@/lib/tokens";
import { listIchiTokens } from "@/lib/ichi-tokens";
import { revoke, revokeIchi } from "./actions";
import ConfirmForm from "@/components/ConfirmForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Tokens — mozg" };

/**
 * One page for both products' credentials.
 *
 * Tabs are links with a query parameter, not client state: this is a page a
 * person lands on from a doc or a chat message, and `?t=ichi` is a thing they
 * can be sent. It also means the tabs work with no JavaScript, which is the
 * same bargain the rest of this site makes.
 *
 * The two kinds stay separate credentials on purpose — one token reaching both
 * your project knowledge and your ichi's memory is a wider blast radius than
 * the convenience is worth — but they are managed in one place, because a
 * person revoking access should not have to remember which product owns what.
 */
type Tab = "mozg" | "ichi";

export default async function TokensPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/settings/tokens");

  const { t } = await searchParams;
  const tab: Tab = t === "ichi" ? "ichi" : "mozg";

  const [tokens, remaining, used, ichiTokens] = await Promise.all([
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
    listIchiTokens(user.id),
  ]);

  const tabStyle = (on: boolean) => ({
    padding: ".55rem .95rem",
    border: "1.5px solid var(--ink)",
    background: on ? "var(--ink)" : "transparent",
    color: on ? "var(--paper-2)" : "var(--ink)",
    textDecoration: "none",
    fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
    fontSize: ".8125rem",
  });

  return (
    <AppShell
      active="/settings/tokens"
      eyebrow={`${used} calls this month · ${remaining} left on ${user.plan}`}
      title="Access tokens"
      narrow
    >
      <div className="stack">
        <nav style={{ display: "flex", gap: ".5rem" }} aria-label="Which product">
          <Link href="/settings/tokens" style={tabStyle(tab === "mozg")}>
            mozg{tokens.length ? ` · ${tokens.length}` : ""}
          </Link>
          <Link href="/settings/tokens?t=ichi" style={tabStyle(tab === "ichi")}>
            ichi{ichiTokens.length ? ` · ${ichiTokens.length}` : ""}
          </Link>
        </nav>

        {tab === "mozg" ? (
          <>
            <div>
              <p className="lede">
                One token per machine. Each token can reach every brain you own or
                have been given access to. Revoking one takes effect on the next
                call. <Link href="/settings/usage">Usage</Link> shows where the
                calls went.
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
                        <ConfirmForm
                          action={revoke}
                          message={`Revoke ${t.prefix}…? Any client using it loses access on the next call.`}
                        >
                          <input type="hidden" name="id" value={t.id} />
                          <button className="mono" style={revokeStyle}>
                            revoke
                          </button>
                        </ConfirmForm>
                      }
                    />
                  ))}
                </Rows>
              </Section>
            )}
          </>
        ) : (
          <>
            <div>
              <p className="lede">
                One token per machine, for{" "}
                <a href="https://ichi.mozg.sh" target="_blank" rel="noreferrer">
                  ichi
                </a>{" "}
                — the sibling that gives your agent a persistent character and
                holds the standards you lay down. Same account as this one.
                Issued here and nowhere else, so every credential you own is on
                one page.
              </p>
              <IchiTokenForm />
            </div>

            {ichiTokens.length > 0 && (
              <Section title="Live ichi tokens" aside={`${ichiTokens.length} active`}>
                <Rows>
                  {ichiTokens.map((t) => (
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
                        <ConfirmForm
                          action={revokeIchi}
                          message={`Revoke ${t.prefix}…? Any agent using it stops reaching ichi on the next call.`}
                        >
                          <input type="hidden" name="id" value={t.id} />
                          <button className="mono" style={revokeStyle}>
                            revoke
                          </button>
                        </ConfirmForm>
                      }
                    />
                  ))}
                </Rows>
              </Section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

const revokeStyle = {
  background: "none",
  border: 0,
  padding: 0,
  color: "var(--color-riso-red)",
  fontSize: ".8125rem",
  cursor: "pointer",
  textDecoration: "underline",
} as const;
