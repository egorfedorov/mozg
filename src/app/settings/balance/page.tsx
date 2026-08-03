import Link from "next/link";
import { redirect } from "next/navigation";
import { query } from "@/db";
import type { LedgerEntry } from "@/db/types";
import { currentUser } from "@/lib/session";
import { formatCents, PLATFORM_FEE_PERCENT } from "@/lib/money-math";
import { MIN_PAYOUT_CENTS } from "@/lib/money";
import AppShell from "@/components/AppShell";
import PayoutForm from "../PayoutForm";

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

  const [balance, entries, earned, openPayout] = await Promise.all([
    query<{ balance_cents: number }>(`select balance_cents from "user" where id = $1`, [
      user.id,
    ]).then((r) => r[0]?.balance_cents ?? 0),
    query<LedgerEntry & { brain_title: string | null }>(
      `select l.*, b.title as brain_title
         from ledger l left join brains b on b.id = l.brain_id
        where l.user_id = $1 order by l.id desc limit 50`,
      [user.id],
    ),
    query<{ total: number; sales: number; spent: number }>(
      `select
         (select coalesce(sum(seller_cents), 0)::int from purchases where seller_id = $1) as total,
         (select count(*)::int from purchases where seller_id = $1) as sales,
         (select coalesce(sum(price_cents), 0)::int from purchases where buyer_id = $1) as spent`,
      [user.id],
    ).then((r) => r[0]),
    query<{ amount_cents: number; destination: string; requested_at: string }>(
      `select amount_cents, destination,
              to_char(requested_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                as requested_at
         from payouts where user_id = $1 and status = 'requested'`,
      [user.id],
    ).then((r) => r[0] ?? null),
  ]);

  return (
    <AppShell active="/settings/balance" eyebrow={user.email} title="Balance">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "1px",
          background: "var(--rule)",
          border: "1.5px solid var(--ink)",
        }}
      >
        <Stat label="Available" value={formatCents(balance)} big />
        <Stat label="Earned" value={formatCents(earned.total)} note={`${earned.sales} sale${earned.sales === 1 ? "" : "s"}`} />
        <Stat label="Spent on brains" value={formatCents(earned.spent)} />
      </div>

      <section style={{ marginTop: "1.5rem", display: "grid", gap: "1.5rem" }}>
        <div className="panel">
          <p className="eyebrow">Topping up</p>
          <p style={{ color: "var(--ink-2)", margin: ".4rem 0 1rem" }}>
            Handled by hand while the crypto gateway is being wired up. Write with
            the amount and we credit the balance the same day — nothing is lost by
            starting this way, it is the same ledger the gateway will write to.
          </p>
          <a
            className="btn"
            href={`mailto:hi@mozg.sh?subject=${encodeURIComponent("Top up balance")}&body=${encodeURIComponent(`Account: ${user.email}\nAmount: `)}`}
          >
            Ask to top up
          </a>
        </div>

        <PayoutForm balanceCents={balance} minCents={MIN_PAYOUT_CENTS} open={openPayout} />
      </section>

      <section style={{ marginTop: "2.5rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: "1rem",
          }}
        >
          <h2 className="display" style={{ fontSize: "1.375rem" }}>
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
                    color: e.amount_cents > 0 ? "var(--color-riso-green)" : "var(--ink)",
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
        <h2 className="display" style={{ fontSize: "1.375rem", marginBottom: ".5rem" }}>
          Selling a brain
        </h2>
        <p style={{ color: "var(--ink-2)", marginTop: 0, maxWidth: "60ch" }}>
          Set a price on the sharing page of any public brain. Buyers pay once and
          keep access as you keep updating it. You receive{" "}
          {100 - PLATFORM_FEE_PERCENT}% of each sale on this balance.
        </p>
        <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
          <Link className="btn btn-ghost" href="/brains">
            Your brains
          </Link>
          <Link className="btn btn-ghost" href="/guide">
            How to build one worth paying for
          </Link>
        </div>
      </section>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  note,
  big,
}: {
  label: string;
  value: string;
  note?: string;
  big?: boolean;
}) {
  return (
    <div style={{ background: "var(--paper-2)", padding: "1rem 1.25rem" }}>
      <span className="eyebrow" style={{ display: "block" }}>
        {label}
      </span>
      <span
        className="display"
        style={{ display: "block", fontSize: big ? "2rem" : "1.5rem", marginTop: ".3rem" }}
      >
        {value}
      </span>
      {note && (
        <span className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)" }}>
          {note}
        </span>
      )}
    </div>
  );
}
