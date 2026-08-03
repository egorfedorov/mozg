import Link from "next/link";
import { redirect } from "next/navigation";
import TopBar from "@/components/TopBar";
import { query } from "@/db";
import type { LedgerEntry } from "@/db/types";
import { currentUser } from "@/lib/session";
import { formatCents, PLATFORM_FEE_PERCENT } from "@/lib/money";

export const dynamic = "force-dynamic";

export const metadata = { title: "Balance — mozg" };

const KIND_LABEL: Record<string, string> = {
  topup: "Top-up",
  purchase: "Bought a brain",
  earning: "Sale",
  payout: "Withdrawal",
  refund: "Refund",
  adjustment: "Adjustment",
};

export default async function BalancePage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/settings/balance");

  const [balance, entries, earned] = await Promise.all([
    query<{ balance_cents: number }>(`select balance_cents from "user" where id = $1`, [
      user.id,
    ]).then((r) => r[0]?.balance_cents ?? 0),
    query<LedgerEntry & { brain_title: string | null }>(
      `select l.*, b.title as brain_title
         from ledger l left join brains b on b.id = l.brain_id
        where l.user_id = $1 order by l.id desc limit 50`,
      [user.id],
    ),
    query<{ total: number; sales: number }>(
      `select coalesce(sum(seller_cents), 0)::int as total, count(*)::int as sales
         from purchases where seller_id = $1`,
      [user.id],
    ).then((r) => r[0] ?? { total: 0, sales: 0 }),
  ]);

  return (
    <>
      <TopBar />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)", maxWidth: 780 }}>
        <p className="eyebrow">{user.email}</p>
        <h1 className="display" style={{ fontSize: "clamp(2rem, 5vw, 3rem)", margin: ".4rem 0 2rem" }}>
          Balance
        </h1>

        <div className="scorecard">
          <div className="score-head">
            <div>
              <p className="eyebrow" style={{ marginBottom: ".35rem" }}>
                Available
              </p>
              <span className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>
                {earned.sales
                  ? `${earned.sales} sale${earned.sales === 1 ? "" : "s"} · ${formatCents(earned.total)} earned`
                  : "spend it on brains, or earn it by selling one"}
              </span>
            </div>
            <div className="score-big">{formatCents(balance)}</div>
          </div>

          <div style={{ padding: "1.25rem" }}>
            <p style={{ margin: "0 0 1rem", color: "var(--ink-2)" }}>
              Top-ups are handled by hand while the crypto gateway is being wired
              up. Write with the amount and we will credit the balance the same
              day — nothing is lost by starting this way, the ledger is the same
              one the gateway will write to.
            </p>
            <a
              className="btn"
              href={`mailto:hi@mozg.sh?subject=${encodeURIComponent("Top up balance")}&body=${encodeURIComponent(`Account: ${user.email}\nAmount: `)}`}
            >
              Ask to top up
            </a>
          </div>
        </div>

        <section style={{ marginTop: "2.5rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: "1rem",
            }}
          >
            <h2 className="display" style={{ fontSize: "1.5rem" }}>
              History
            </h2>
            <span className="eyebrow">every movement, nothing hidden</span>
          </div>

          {entries.length === 0 ? (
            <div className="panel">
              <p style={{ margin: 0, color: "var(--ink-2)" }}>
                Nothing yet. Money appears here the moment it moves — top-ups,
                purchases, and sales of your own brains.
              </p>
            </div>
          ) : (
            <div className="panel" style={{ padding: 0 }}>
              {entries.map((e) => (
                <div
                  key={e.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "1rem",
                    padding: ".75rem 1.25rem",
                    borderBottom: "1px solid var(--rule)",
                    alignItems: "baseline",
                  }}
                >
                  <span>
                    {KIND_LABEL[e.kind] ?? e.kind}
                    {e.brain_title && (
                      <span style={{ color: "var(--ink-2)" }}> · {e.brain_title}</span>
                    )}
                    <span
                      className="mono"
                      style={{ display: "block", fontSize: ".6875rem", color: "var(--ink-3)" }}
                    >
                      {new Date(e.created_at).toISOString().slice(0, 10)}
                      {e.note ? ` · ${e.note}` : ""}
                    </span>
                  </span>
                  <span
                    className="mono"
                    style={{
                      color:
                        e.amount_cents > 0 ? "var(--color-riso-green)" : "var(--ink)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {e.amount_cents > 0 ? "+" : "−"}
                    {formatCents(Math.abs(e.amount_cents))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={{ marginTop: "2.5rem" }}>
          <h2 className="display" style={{ fontSize: "1.5rem", marginBottom: ".5rem" }}>
            Selling a brain
          </h2>
          <p style={{ color: "var(--ink-2)", marginTop: 0, maxWidth: "60ch" }}>
            Set a price on the sharing page of any public brain. Buyers pay once and
            keep access as you keep updating it. You receive{" "}
            {100 - PLATFORM_FEE_PERCENT}% of each sale on this balance; withdrawals
            are by request while payouts are manual.
          </p>
          <Link className="btn btn-ghost" href="/brains">
            Your brains
          </Link>
        </section>
      </main>
    </>
  );
}
