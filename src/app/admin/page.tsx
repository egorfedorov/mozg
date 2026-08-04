import Link from "next/link";
import AppShell from "@/components/AppShell";
import {
  requireAdmin,
  health,
  adminMoney,
  adminLedger,
  adminBrains,
  openPayouts,
} from "@/lib/admin";
import { formatCents } from "@/lib/money-math";
import { Section, Stats, Stat, Rows, Row } from "@/components/ui";
import { settleWithdrawal } from "./actions";
import { query } from "@/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin — mozg", robots: { index: false, follow: false } };

export default async function AdminPage() {
  await requireAdmin();

  const [h, money, ledger, brains, payouts, payments, totals] = await Promise.all([
    health(),
    adminMoney(),
    adminLedger(12),
    adminBrains(200),
    openPayouts(),
    query<{
      email: string;
      amount_cents: number;
      status: string;
      provider: string;
      pay_coin: string | null;
      purpose: string;
      brain_title: string | null;
      created_at: string;
    }>(
      `select u.email, t.amount_cents, t.status, t.provider, t.pay_coin,
              t.purpose, b.title as brain_title,
              to_char(t.created_at at time zone 'UTC', 'MM-DD HH24:MI') as created_at
         from topups t
         join "user" u on u.id = t.user_id
         left join brains b on b.id = t.buy_brain_id
        order by t.created_at desc limit 20`,
    ),
    query<{ users: number; brains: number; notes: number; public_brains: number; paid_brains: number }>(
      `select
         (select count(*)::int from "user") as users,
         (select count(*)::int from brains) as brains,
         (select coalesce(sum(note_count), 0)::int from brains) as notes,
         (select count(*)::int from brains where visibility = 'public') as public_brains,
         (select count(*)::int from brains where price_cents > 0) as paid_brains`,
    ),
  ]);

  const t = totals[0];
  const attention = brains.filter((b) => b.failed_sources > 0).slice(0, 8);

  return (
    <AppShell active="/admin" eyebrow="Operator" title="System">
      <div className="stack">
        {/* Is anything broken right now? Nothing else on this page matters if
            the answer is yes. */}
        <Section title="Right now">
          <Stats>
            <Stat label="Database" dot={h.database ? "ok" : "down"} value={h.database ? "up" : "down"} />
            <Stat
              label="Embeddings"
              dot={h.embeddings ? "ok" : "down"}
              value={h.embeddings ? "up" : "down"}
            />
            <Stat
              label="Ingest queue"
              dot={h.stuck > 0 ? "down" : "ok"}
              value={h.stuck > 0 ? `${h.stuck} stuck` : `${h.pending} pending`}
            />
            <Stat
              label="MCP · 5 min"
              dot={h.callsLive > 0 ? "ok" : "idle"}
              value={h.callsLive > 0 ? `${h.callsLive} calls` : "quiet"}
            />
            <Stat
              label="MCP · 24 h"
              dot={h.failuresDay > 0 ? "down" : "ok"}
              value={`${h.callsDay} calls${h.failuresDay ? `, ${h.failuresDay} failed` : ""}`}
            />
          </Stats>
        </Section>

        <Section title="Size of the thing">
          <Stats>
            <Stat label="People" value={String(t.users)} href="/admin/users" />
            <Stat label="Brains" value={String(t.brains)} href="/admin/brains" />
            <Stat label="Notes" value={t.notes.toLocaleString()} />
            <Stat label="Public" value={String(t.public_brains)} />
            <Stat label="On sale" value={String(t.paid_brains)} />
          </Stats>
        </Section>

        {payouts.length > 0 && (
          <Section title="Withdrawals waiting" aside={`${payouts.length} to send`}>
            <p className="lede" style={{ marginBottom: ".75rem" }}>
              Send the transfer first, then mark it paid — marking it is what
              debits the balance.
            </p>
            <div className="adm-scroll">
              <table className="adm">
                <thead>
                  <tr>
                    <th>Asked</th>
                    <th>Who</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                    <th style={{ textAlign: "right" }}>Balance</th>
                    <th>Send to</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((p) => (
                    <tr key={p.id}>
                      <td className="mono">{p.requested_at.slice(0, 10)}</td>
                      <td>{p.handle ?? p.email}</td>
                      <td className="num">{formatCents(p.amount_cents)}</td>
                      <td className="num">{formatCents(p.balance_cents)}</td>
                      <td
                        className="mono"
                        style={{ maxWidth: "28ch", overflow: "hidden", textOverflow: "ellipsis" }}
                      >
                        {p.destination}
                      </td>
                      <td>
                        <span style={{ display: "flex", gap: ".3rem" }}>
                          <form action={settleWithdrawal}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="paid" value="yes" />
                            <button type="submit">Mark paid</button>
                          </form>
                          <form action={settleWithdrawal}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="paid" value="no" />
                            <button type="submit" data-danger="true">
                              Reject
                            </button>
                          </form>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        <Section title="Payments" aside="who paid, who is waiting">
          <Rows empty="No invoices yet. The first one shows up the moment someone opens a payment page.">
            {payments.map((p, i) => (
              <Row
                key={i}
                title={`${formatCents(p.amount_cents)} · ${p.email}`}
                sub={
                  (p.purpose === "buy" && p.brain_title ? `buying “${p.brain_title}” · ` : "") +
                  `${p.provider}${p.pay_coin ? ` · ${p.pay_coin}` : ""}`
                }
                meta={p.created_at}
                side={p.status}
                tint={p.status === "paid" ? "green" : p.status === "pending" ? "orange" : "red"}
              />
            ))}
          </Rows>
        </Section>

        <Section title="Money" aside="the ledger, not the balances">
          <Stats>
            <Stat label="Topped up" value={formatCents(money.topped_up)} />
            <Stat label="Spent" value={formatCents(money.spent)} />
            <Stat label="To authors" value={formatCents(money.to_authors)} />
            <Stat label="Our cut" value={formatCents(money.platform_cut)} />
            <Stat label="Held by users" value={formatCents(money.outstanding)} note="what we owe" />
            <Stat label="Purchases" value={String(money.purchases)} />
          </Stats>

          <div style={{ marginTop: "1.25rem" }}>
            <Rows empty="No movements yet. The first one will be a top-up.">
              {ledger.map((row) => (
                <Row
                  key={row.id}
                  title={row.kind}
                  sub={row.email}
                  meta={`${row.created_at.slice(0, 10)}${row.brain_title ? ` · ${row.brain_title}` : row.note ? ` · ${row.note}` : ""}`}
                  side={`${row.amount_cents < 0 ? "−" : "+"}${formatCents(Math.abs(row.amount_cents))}`}
                  sign={row.amount_cents > 0 ? "up" : undefined}
                />
              ))}
            </Rows>
          </div>
        </Section>

        {attention.length > 0 && (
          <Section title="Brains with failed sources" aside={`${attention.length} affected`}>
            <Rows>
              {attention.map((b) => (
                <Row
                  key={b.id}
                  tint="red"
                  title={b.title}
                  sub={b.owner_email}
                  side={`${b.failed_sources} failed`}
                />
              ))}
            </Rows>
          </Section>
        )}
      </div>
    </AppShell>
  );
}
