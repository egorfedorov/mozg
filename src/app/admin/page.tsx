import Link from "next/link";
import AppShell from "@/components/AppShell";
import AdminNav from "./AdminNav";
import {
  requireAdmin,
  health,
  adminMoney,
  adminLedger,
  adminBrains,
  openPayouts,
} from "@/lib/admin";
import { formatCents } from "@/lib/money-math";
import { settleWithdrawal } from "./actions";
import { query } from "@/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin — mozg", robots: { index: false, follow: false } };

export default async function AdminPage() {
  await requireAdmin();

  const [h, money, ledger, brains, payouts, totals] = await Promise.all([
    health(),
    adminMoney(),
    adminLedger(12),
    adminBrains(200),
    openPayouts(),
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
    <AppShell active="/admin" eyebrow="Operator" title="Overview">
        <AdminNav active="/admin" />

        {/* Is anything broken right now? Nothing else on this page matters if
            the answer is yes. */}
        <section style={{ marginTop: "2rem" }}>
          <h2 className="display" style={{ fontSize: "1.25rem", marginBottom: ".75rem" }}>
            Right now
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "1px",
              background: "var(--rule)",
              border: "1.5px solid var(--ink)",
            }}
          >
            <Cell label="Database" state={h.database ? "ok" : "down"} value={h.database ? "up" : "down"} />
            <Cell
              label="Embeddings"
              state={h.embeddings ? "ok" : "down"}
              value={h.embeddings ? "up" : "down"}
            />
            <Cell
              label="Ingest queue"
              state={h.stuck > 0 ? "down" : "ok"}
              value={h.stuck > 0 ? `${h.stuck} stuck` : `${h.pending} pending`}
            />
            <Cell
              label="MCP · 5 min"
              state={h.callsLive > 0 ? "ok" : "idle"}
              value={h.callsLive > 0 ? `${h.callsLive} calls` : "quiet"}
            />
            <Cell
              label="MCP · 24 h"
              state={h.failuresDay > 0 ? "down" : "ok"}
              value={`${h.callsDay} calls${h.failuresDay ? `, ${h.failuresDay} failed` : ""}`}
            />
          </div>
        </section>

        <section style={{ marginTop: "2rem" }}>
          <h2 className="display" style={{ fontSize: "1.25rem", marginBottom: ".75rem" }}>
            Size of the thing
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "1px",
              background: "var(--rule)",
              border: "1.5px solid var(--ink)",
            }}
          >
            <Cell label="People" value={String(t.users)} href="/admin/users" />
            <Cell label="Brains" value={String(t.brains)} href="/admin/brains" />
            <Cell label="Notes" value={t.notes.toLocaleString()} />
            <Cell label="Public" value={String(t.public_brains)} />
            <Cell label="On sale" value={String(t.paid_brains)} />
          </div>
        </section>

        {payouts.length > 0 && (
          <section style={{ marginTop: "2rem" }}>
            <h2 className="display" style={{ fontSize: "1.25rem", marginBottom: ".25rem" }}>
              Withdrawals waiting
            </h2>
            <p style={{ color: "var(--ink-2)", marginTop: 0, maxWidth: "62ch" }}>
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
                      <td className="mono" style={{ maxWidth: "28ch", overflow: "hidden", textOverflow: "ellipsis" }}>
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
          </section>
        )}

        <section style={{ marginTop: "2rem" }}>
          <h2 className="display" style={{ fontSize: "1.25rem", marginBottom: ".75rem" }}>
            Money
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "1px",
              background: "var(--rule)",
              border: "1.5px solid var(--ink)",
            }}
          >
            <Cell label="Topped up" value={formatCents(money.topped_up)} />
            <Cell label="Spent" value={formatCents(money.spent)} />
            <Cell label="To authors" value={formatCents(money.to_authors)} />
            <Cell label="Our cut" value={formatCents(money.platform_cut)} />
            <Cell
              label="Held by users"
              value={formatCents(money.outstanding)}
              note="what we owe"
            />
            <Cell label="Purchases" value={String(money.purchases)} />
          </div>

          <div className="adm-scroll" style={{ marginTop: "1rem" }}>
            <table className="adm">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Kind</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>What</th>
                </tr>
              </thead>
              <tbody>
                {ledger.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ color: "var(--ink-2)" }}>
                      No movements yet. The first one will be a top-up.
                    </td>
                  </tr>
                ) : (
                  ledger.map((row) => (
                    <tr key={row.id}>
                      <td className="mono" suppressHydrationWarning>
                        {new Date(row.created_at).toLocaleString([], { hour12: false })}
                      </td>
                      <td>{row.email}</td>
                      <td className="mono">{row.kind}</td>
                      <td
                        className="num"
                        style={{ color: row.amount_cents < 0 ? "var(--color-riso-red)" : undefined }}
                      >
                        {row.amount_cents < 0 ? "−" : "+"}
                        {formatCents(Math.abs(row.amount_cents))}
                      </td>
                      <td style={{ color: "var(--ink-2)" }}>
                        {row.brain_title ?? row.note ?? "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {attention.length > 0 && (
          <section style={{ marginTop: "2rem" }}>
            <h2 className="display" style={{ fontSize: "1.25rem", marginBottom: ".75rem" }}>
              Brains with failed sources
            </h2>
            <div className="adm-scroll">
              <table className="adm">
                <thead>
                  <tr>
                    <th>Brain</th>
                    <th>Owner</th>
                    <th style={{ textAlign: "right" }}>Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {attention.map((b) => (
                    <tr key={b.id}>
                      <td>{b.title}</td>
                      <td style={{ color: "var(--ink-2)" }}>{b.owner_email}</td>
                      <td className="num" style={{ color: "var(--color-riso-red)" }}>
                        {b.failed_sources}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </AppShell>
  );
}

function Cell({
  label,
  value,
  state,
  note,
  href,
}: {
  label: string;
  value: string;
  state?: "ok" | "down" | "idle";
  note?: string;
  href?: string;
}) {
  const body = (
    <>
      <span className="eyebrow" style={{ display: "block" }}>
        {label}
      </span>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: ".45rem",
          marginTop: ".35rem",
          fontSize: "1.125rem",
          fontWeight: 600,
        }}
      >
        {state && <span className="dot" data-state={state} />}
        {value}
      </span>
      {note && (
        <span className="mono" style={{ display: "block", fontSize: ".6875rem", color: "var(--ink-3)" }}>
          {note}
        </span>
      )}
    </>
  );
  const style: React.CSSProperties = { background: "var(--paper-2)", padding: ".85rem 1rem" };
  return href ? (
    <Link href={href} style={style}>
      {body}
    </Link>
  ) : (
    <div style={style}>{body}</div>
  );
}
