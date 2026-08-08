import Link from "next/link";
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
    /*
     * The sibling product's tokens, read straight from its schema.
     *
     * ichi shares this database and this account — one user row, one plan —
     * but keeps its tables in an `ichi` schema so neither migration runner can
     * touch the other's. A read of two columns is a small, deliberate coupling
     * and much less machinery than an internal API for a list nobody paginates.
     *
     * Credentials stay separate on purpose: one token reaching both a
     * knowledge brain and somebody's personal memory is a bigger blast radius
     * than the convenience is worth. So this page shows them and sends you to
     * ichi to mint or revoke — it never issues one.
     *
     * Degrades to an empty list rather than a 500: this page is about mozg's
     * tokens, and the sibling being down must not take it with them.
     */
    query<{ prefix: string; name: string | null; last_used_at: Date | null }>(
      `select prefix, name, last_used_at from ichi.ichi_tokens
        where user_id = $1 and revoked_at is null
        order by created_at desc`,
      [user.id],
    ).catch(() => []),
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
            have been given access to. Revoking one takes effect on the next call.{" "}
            <Link href="/settings/usage">Usage</Link> shows where the calls went.
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
                    </ConfirmForm>
                  }
                />
              ))}
            </Rows>
          </Section>
        )}
        {/* One account, two products. Shown even when empty, because the
            point is telling a mozg user that ichi exists and uses this same
            login — an empty section says that; a hidden one says nothing. */}
        <Section
          title="ichi tokens"
          aside={ichiTokens.length ? `${ichiTokens.length} active` : undefined}
        >
          {ichiTokens.length > 0 ? (
            <Rows>
              {ichiTokens.map((t) => (
                <Row
                  key={t.prefix}
                  title={`${t.prefix}…`}
                  sub={t.name ?? undefined}
                  meta={
                    t.last_used_at
                      ? `last used ${new Date(t.last_used_at).toISOString().slice(0, 10)}`
                      : "never used"
                  }
                />
              ))}
            </Rows>
          ) : (
            <p className="lede" style={{ margin: 0 }}>
              None yet.{" "}
              <a href="https://ichi.mozg.sh" target="_blank" rel="noreferrer">
                ichi
              </a>{" "}
              gives your agent a persistent character and holds the standards you
              lay down. Same account as this one — run <code>:token</code> in its
              console to mint one.
            </p>
          )}
          <p className="hint" style={{ marginTop: ".75rem" }}>
            Minted and revoked in{" "}
            <a href="https://ichi.mozg.sh" target="_blank" rel="noreferrer">
              ichi&apos;s console
            </a>
            . Kept separate from mozg tokens on purpose: one credential reaching
            both your project knowledge and your ichi&apos;s memory is a wider
            blast radius than the convenience is worth.
          </p>
        </Section>
      </div>
    </AppShell>
  );
}
