import Link from "next/link";
import { redirect } from "next/navigation";
import { query } from "@/db";
import type { LedgerEntry } from "@/db/types";
import { currentUser } from "@/lib/session";
import { formatCents, PLATFORM_FEE_PERCENT } from "@/lib/money-math";
import { MIN_PAYOUT_CENTS } from "@/lib/money";
import AppShell from "@/components/AppShell";
import { Section, Stats, Stat, Rows, Row } from "@/components/ui";
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
      <div className="stack">
        <Stats>
          <Stat label="Available" value={formatCents(balance)} big />
          <Stat
            label="Earned"
            value={formatCents(earned.total)}
            note={`${earned.sales} sale${earned.sales === 1 ? "" : "s"}`}
          />
          <Stat label="Spent on brains" value={formatCents(earned.spent)} />
        </Stats>

        <div className="stack-tight">
          <div className="panel">
            <p className="eyebrow">Topping up</p>
            <p style={{ color: "var(--ink-2)", margin: ".4rem 0 1rem" }}>
              Crypto — USDT, USDC, BTC and more. Card and other methods are on
              the way.
            </p>
            <Link className="btn" href="/settings/topup">
              Top up balance
            </Link>
          </div>

          <PayoutForm balanceCents={balance} minCents={MIN_PAYOUT_CENTS} open={openPayout} />
        </div>

        <Section title="History" aside="every movement, nothing hidden">
          <Rows
            empty="Nothing yet. Money appears here the moment it moves — top-ups, purchases, and sales of your own brains."
          >
            {entries.map((e) => (
              <Row
                key={e.id}
                title={KIND_LABEL[e.kind] ?? e.kind}
                sub={e.brain_title ?? undefined}
                meta={`${new Date(e.created_at).toISOString().slice(0, 10)}${e.note ? ` · ${e.note}` : ""}`}
                side={`${e.amount_cents > 0 ? "+" : "−"}${formatCents(Math.abs(e.amount_cents))}`}
                sign={e.amount_cents > 0 ? "up" : undefined}
              />
            ))}
          </Rows>
        </Section>

        <Section title="Selling a brain">
          <p className="lede">
            Set a price on the sharing page of any public brain. Buyers pay once
            and keep access as you keep updating it. You receive{" "}
            {100 - PLATFORM_FEE_PERCENT}% of each sale on this balance.
          </p>
          <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", marginTop: "1rem" }}>
            <Link className="btn btn-ghost" href="/brains">
              Your brains
            </Link>
            <Link className="btn btn-ghost" href="/guide#selling">
              How to build one worth paying for
            </Link>
          </div>
        </Section>
      </div>
    </AppShell>
  );
}
