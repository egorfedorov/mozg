import AppShell from "@/components/AppShell";
import {
  requireAdmin,
  health,
  adminMoney,
  adminLedger,
  adminBrains,
  openPayouts,
  openPlanRequests,
} from "@/lib/admin";
import { formatCents } from "@/lib/money-math";
import { REPLY_LANGS } from "@/lib/translate";
import { Section, Stats, Stat, Rows, Row } from "@/components/ui";
import { settleWithdrawal, resolveUpgrade, messageUser } from "./actions";
import WalletsForm from "./WalletsForm";
import { query } from "@/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin — mozg", robots: { index: false, follow: false } };

export default async function AdminPage() {
  await requireAdmin();

  const [h, money, ledger, brains, payouts, requests, payments, totals] = await Promise.all([
    health(),
    adminMoney(),
    adminLedger(12),
    adminBrains(200),
    openPayouts(),
    openPlanRequests(),
    query<{
      user_id: string;
      email: string;
      amount_cents: number;
      status: string;
      provider: string;
      pay_coin: string | null;
      purpose: string;
      brain_title: string | null;
      created_at: string;
    }>(
      `select u.id as user_id, u.email, t.amount_cents, t.status, t.provider, t.pay_coin,
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

  // What today actually cost us: extraction and exams keep their cost on
  // their own rows, everything else lands in `spend`. BYOK calls are absent
  // by design — that money was never ours.
  const [cost] = await query<{ day: number; week: number }>(
    `select
       (select coalesce(sum(cost_cents), 0) from sources
         where processed_at > now() - interval '24 hours')
     + (select coalesce(sum(cost_cents), 0) from check_runs
         where started_at > now() - interval '24 hours')
     + (select coalesce(sum(cents), 0) from spend
         where created_at > now() - interval '24 hours') as day,
       (select coalesce(sum(cost_cents), 0) from sources
         where processed_at > now() - interval '7 days')
     + (select coalesce(sum(cost_cents), 0) from check_runs
         where started_at > now() - interval '7 days')
     + (select coalesce(sum(cents), 0) from spend
         where created_at > now() - interval '7 days') as week`,
  );

  const t = totals[0];
  const attention = brains.filter((b) => b.failed_sources > 0).slice(0, 8);

  // Wallet overrides: value shown is the override; the env address (if any)
  // rides in the placeholder so an empty field reads as "falls back to this".
  const walletRows = await query<{ key: string; value: string }>(
    `select key, value from app_settings where key like 'mozgpay_addr_%'`,
  );
  const wallet = (k: string) => walletRows.find((r) => r.key === `mozgpay_addr_${k}`)?.value ?? "";
  const wallets = [
    { field: "tron", label: "TRON (USDT TRC-20)", envValue: env.MOZGPAY_TRON_ADDRESS },
    { field: "eth", label: "Ethereum (USDT / USDC ERC-20)", envValue: env.MOZGPAY_ETH_ADDRESS },
    { field: "sol", label: "Solana (USDC SPL)", envValue: env.MOZGPAY_SOL_ADDRESS },
    { field: "btc", label: "Bitcoin", envValue: env.MOZGPAY_BTC_ADDRESS },
  ];

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
              label="Model spend 24h"
              value={`$${(Number(cost?.day ?? 0) / 100).toFixed(2)}`}
            />
            <Stat
              label="…last 7 days"
              value={`$${(Number(cost?.week ?? 0) / 100).toFixed(2)}`}
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

        {requests.length > 0 && (
          <Section title="Plan requests" aside={`${requests.length} waiting`}>
            <p className="lede" style={{ marginBottom: ".75rem" }}>
              Approving grants the plan for 30 days without touching the
              balance — the door for people who paid off-band. A user with
              enough on the balance can skip this queue and pay in settings.
            </p>
            <div className="adm-scroll">
              <table className="adm">
                <thead>
                  <tr>
                    <th>Asked</th>
                    <th>Who</th>
                    <th>Plan</th>
                    <th style={{ textAlign: "right" }}>Balance</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{r.created_at.slice(0, 10)}</td>
                      <td>{r.handle ?? r.email}</td>
                      <td className="mono">{r.plan}</td>
                      <td className="num">{formatCents(r.balance_cents)}</td>
                      <td>
                        <span style={{ display: "flex", gap: ".3rem" }}>
                          <form action={resolveUpgrade}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="approve" value="yes" />
                            <button type="submit">Approve</button>
                          </form>
                          <form action={resolveUpgrade}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="approve" value="no" />
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
              <div key={i} className="row-block">
                <Row
                  title={`${formatCents(p.amount_cents)} · ${p.email}`}
                  sub={
                    (p.purpose === "buy" && p.brain_title ? `buying “${p.brain_title}” · ` : "") +
                    `${p.provider}${p.pay_coin ? ` · ${p.pay_coin}` : ""}`
                  }
                  meta={p.created_at}
                  side={p.status}
                  tint={p.status === "paid" ? "green" : p.status === "pending" ? "orange" : "red"}
                />
                {/* A failed invoice is a reason to reach out, not to wait for
                    them to find chatmozg. Lands in their thread + mascot badge. */}
                <details className="row-reach">
                  <summary className="mono">message {p.email} →</summary>
                  <form action={messageUser}>
                    <input type="hidden" name="user_id" value={p.user_id} />
                    <textarea
                      name="body"
                      rows={2}
                      required
                      placeholder="Пиши по-русски — уйдёт на языке собеседника"
                    />
                    <span style={{ display: "flex", gap: ".6rem", alignItems: "center" }}>
                      <button className="btn" style={{ padding: ".35rem .8rem" }}>Send</button>
                      <label className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", display: "flex", gap: ".35rem", alignItems: "center" }}>
                        send in
                        <select name="lang" defaultValue="auto" style={{ font: "inherit", border: "1.5px solid var(--ink)", background: "var(--paper)", padding: ".2rem .3rem" }}>
                          {REPLY_LANGS.map((l) => (
                            <option key={l.code} value={l.code}>{l.label}</option>
                          ))}
                        </select>
                      </label>
                    </span>
                  </form>
                </details>
              </div>
            ))}
          </Rows>
        </Section>

        <Section title="mozgpay wallets" aside="where the crypto lands">
          <p className="lede" style={{ marginBottom: ".75rem" }}>
            Overrides the env addresses without a deploy. Empty field = fall
            back to env. Only NEW invoices use a changed address — open ones
            are watched at the address they were issued with.
          </p>
          <WalletsForm
            wallets={wallets.map((w) => ({
              field: w.field,
              label: w.label,
              value: wallet(w.field),
              envValue: w.envValue,
            }))}
          />
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
