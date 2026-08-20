import { translator } from "@/lib/t";
import { fill, markup } from "@/lib/markup";
import AppShell from "@/components/AppShell";
import {
  requireAdmin,
  health,
  adminMoney,
  adminLedger,
  adminBrains,
  openPayouts,
  openPlanRequests,
  toolReach,
} from "@/lib/admin";
import { formatCents } from "@/lib/money-math";
import { Section, Stats, Stat, Rows, Row } from "@/components/ui";
import { settleWithdrawal, resolveUpgrade, requeueBrainSources } from "./actions";
import WalletsForm from "./WalletsForm";
import MessageUserForm from "./MessageUserForm";
import PushToggle from "@/components/PushToggle";
import { query } from "@/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await translator();
  return { title: t("Admin — mozg"), robots: { index: false, follow: false } };
}

export default async function AdminPage() {
  const t = await translator();

  await requireAdmin();

  const [h, money, ledger, brains, payouts, requests, payments, totals, reach] = await Promise.all([
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
    toolReach(),
  ]);

  // What today actually cost us: extraction and exams keep their cost on
  // their own rows, everything else lands in `spend`. BYOK calls are absent
  // by design — that money was never ours.
  // What the extraction bill is made of. One number cannot say whether a big
  // day was reading or writing, and the answer decides what you cut: fewer
  // pages, or shorter notes. Output bills about five times input.
  // Signup → first brain_search, the one activation step that matters: a
  // person who never made a search never met the product. Logged since the
  // beginning and never looked at, which is how "35 users, 3 purchases" stays
  // a mystery instead of a funnel.
  const [funnel] = await query<{
    signed_up: number;
    connected: number;
    searched: number;
    median_minutes: number | null;
  }>(
    `with first_search as (
       select caller_id, min(created_at) as at
         from calls where tool = 'brain_search' group by caller_id
     )
     select
       (select count(*)::int from "user")                                    as signed_up,
       (select count(distinct user_id)::int from mcp_tokens
         where revoked_at is null)                                           as connected,
       (select count(*)::int from first_search)                              as searched,
       (select round(percentile_cont(0.5) within group (
                 order by extract(epoch from (fs.at - u."createdAt")) / 60))::int
          from first_search fs join "user" u on u.id = fs.caller_id
         where fs.at > u."createdAt")                                        as median_minutes`,
  );

  const [mix] = await query<{ in_tok: number; out_tok: number }>(
    `select coalesce(sum(input_tokens), 0)::bigint as in_tok,
            coalesce(sum(output_tokens), 0)::bigint as out_tok
       from sources where processed_at > now() - interval '7 days'`,
  );

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

  const totalsRow = totals[0];
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
    <AppShell active="/admin" eyebrow={t("Operator")} title={t("System")}>
      <div className="stack">
        {/* Is anything broken right now? Nothing else on this page matters if
            the answer is yes. */}
        <Section title={t("Right now")}>
          <Stats>
            <Stat label={t("Database")} dot={h.database ? "ok" : "down"} value={h.database ? "up" : "down"} />
            <Stat
              label={t("Embeddings")}
              dot={h.embeddings ? "ok" : "down"}
              value={h.embeddings ? "up" : "down"}
            />
            <Stat
              label={t("Model spend 24h")}
              value={`$${(Number(cost?.day ?? 0) / 100).toFixed(2)}`}
            />
            <Stat
              label={t("…last 7 days")}
              value={`$${(Number(cost?.week ?? 0) / 100).toFixed(2)}`}
              note={
                Number(mix?.out_tok ?? 0) > 0
                  ? `${Math.round(
                      (Number(mix.out_tok) * 100) /
                        (Number(mix.in_tok) + Number(mix.out_tok)),
                    )}% of tokens are output`
                  : undefined
              }
            />
            <Stat
              label={t("Ingest queue")}
              dot={h.stuck > 0 ? "down" : "ok"}
              value={h.stuck > 0 ? `${h.stuck} stuck` : `${h.pending} pending`}
            />
            <Stat
              label={t("MCP · 5 min")}
              dot={h.callsLive > 0 ? "ok" : "idle"}
              value={h.callsLive > 0 ? `${h.callsLive} calls` : "quiet"}
            />
            <Stat
              label={t("MCP · 24 h")}
              dot={h.failuresDay > 0 ? "down" : "ok"}
              value={`${h.callsDay} calls${h.failuresDay ? fill(t(", <0/> failed"), [h.failuresDay]) : ""}`}
            />
          </Stats>
        </Section>

        {/* The one number that can say the persuasion is not working. Four
            layers exist to make an agent reach for a brain unprompted and none
            of them was measured — an account that connects and only ever lists
            has a brain it never asks, which a total call count hides because
            listing is itself a call. */}
        <Section
          title={t("Do connected agents actually use it? · 7 days")}
          aside={t("distinct accounts, not calls")}
        >
          <Stats>
            <Stat label={t("Agents calling")} value={String(reach.active)} note={t("any tool")} />
            <Stat
              label={t("…that searched")}
              value={reach.active ? `${reach.searched} · ${Math.round((reach.searched / reach.active) * 100)}%` : "0"}
              dot={reach.active && reach.searched / reach.active >= 0.5 ? "ok" : "down"}
              note={t("asked before answering")}
            />
            <Stat
              label={t("…that wrote back")}
              value={String(reach.wrote)}
              note={t("taught it something")}
            />
            <Stat
              label={t("…that left a baton")}
              value={String(reach.handed)}
              note={t("handoff for the next session")}
            />
          </Stats>
        </Section>

        <Section title={t("Size of the thing")}>
          <Stats>
            <Stat label={t("People")} value={String(totalsRow.users)} href="/admin/users" />
            <Stat
              label={t("Connected an agent")}
              value={`${funnel?.connected ?? 0}`}
              note={
                funnel?.signed_up
                  ? `${Math.round(((funnel.connected ?? 0) * 100) / funnel.signed_up)}% of signups`
                  : undefined
              }
            />
            <Stat
              label={t("Searched once")}
              value={`${funnel?.searched ?? 0}`}
              note={
                funnel?.median_minutes != null
                  ? `median ${funnel.median_minutes} min after signup`
                  : t("nobody yet")
              }
            />
            <Stat label={t("Brains")} value={String(totalsRow.brains)} href="/admin/brains" />
            <Stat label={t("Notes")} value={totalsRow.notes.toLocaleString()} />
            <Stat label={t("Public")} value={String(totalsRow.public_brains)} />
            <Stat label={t("On sale")} value={String(totalsRow.paid_brains)} />
          </Stats>
        </Section>

        {payouts.length > 0 && (
          <Section title={t("Withdrawals waiting")} aside={fill(t("<0/> to send"), [payouts.length])}>
            <p className="lede" style={{ marginBottom: ".75rem" }}>
              {t("Send the transfer first, then mark it paid — marking it is what debits the balance.")}</p>
            <div className="adm-scroll">
              <table className="adm">
                <thead>
                  <tr>
                    <th>{t("Asked")}</th>
                    <th>{t("Who")}</th>
                    <th style={{ textAlign: "right" }}>{t("Amount")}</th>
                    <th style={{ textAlign: "right" }}>{t("Balance")}</th>
                    <th>{t("Send to")}</th>
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
                            <button type="submit">{t("Mark paid")}</button>
                          </form>
                          <form action={settleWithdrawal}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="paid" value="no" />
                            <button type="submit" data-danger="true">
                              {t("Reject")}</button>
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
          <Section title={t("Plan requests")} aside={`${requests.length} waiting`}>
            <p className="lede" style={{ marginBottom: ".75rem" }}>
              {t("Approving grants the plan for 30 days without touching the balance — the door for people who paid off-band. A user with enough on the balance can skip this queue and pay in settings.")}</p>
            <div className="adm-scroll">
              <table className="adm">
                <thead>
                  <tr>
                    <th>{t("Asked")}</th>
                    <th>{t("Who")}</th>
                    <th>{t("Plan")}</th>
                    <th style={{ textAlign: "right" }}>{t("Balance")}</th>
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
                            <button type="submit">{t("Approve")}</button>
                          </form>
                          <form action={resolveUpgrade}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="approve" value="no" />
                            <button type="submit" data-danger="true">
                              {t("Reject")}</button>
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

        <div id="payments">
        <Section title={t("Payments")} aside={t("who paid, who is waiting")}>
          {/* Live money first. An invoice that expired unpaid is not news —
              seven red rows of old test attempts buried the one pending
              payment worth watching, so the noise folds shut below. */}
          <Rows empty={t("No invoices yet. The first one shows up the moment someone opens a payment page.")}>
            {payments.filter((p) => p.status !== "failed" && p.status !== "expired").map((p, i) => (
              <div key={i} className="row-block">
                <Row
                  title={`${formatCents(p.amount_cents)} · ${p.email}`}
                  sub={
                    (p.purpose === "buy" && p.brain_title ? fill(t("buying “<0/>” · "), [p.brain_title]) : "") +
                    `${p.provider}${p.pay_coin ? ` · ${p.pay_coin}` : ""}`
                  }
                  meta={p.created_at}
                  side={p.status}
                  tint={p.status === "paid" ? "green" : "orange"}
                />
                {/* A stuck invoice is a reason to reach out, not to wait for
                    them to find chatmozg. Lands in their thread + mascot badge. */}
                <MessageUserForm userId={p.user_id} label={p.email} />
              </div>
            ))}
          </Rows>

          {payments.some((p) => p.status === "failed" || p.status === "expired") && (
            <details style={{ marginTop: ".75rem" }}>
              <summary className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", cursor: "pointer" }}>
                {markup(t("<0/> expired without payment — show"), [
                payments.filter((p) => p.status === "failed" || p.status === "expired").length,
              ])}</summary>
              <div style={{ marginTop: ".5rem" }}>
                <Rows>
                  {payments.filter((p) => p.status === "failed" || p.status === "expired").map((p, i) => (
                    <div key={i} className="row-block">
                      <Row
                        title={`${formatCents(p.amount_cents)} · ${p.email}`}
                        sub={
                          (p.purpose === "buy" && p.brain_title ? fill(t("buying “<0/>” · "), [p.brain_title]) : "") +
                          `${p.provider}${p.pay_coin ? ` · ${p.pay_coin}` : ""}`
                        }
                        meta={p.created_at}
                        side={p.status}
                        tint="red"
                      />
                      <MessageUserForm userId={p.user_id} label={p.email} />
                    </div>
                  ))}
                </Rows>
              </div>
            </details>
          )}
        </Section>
        </div>

        <Section title={t("Notifications")} aside={t("Chrome · Safari 16.4+ · Firefox")}>
          <p className="lede" style={{ marginBottom: ".75rem" }}>
            {t("A browser notification the moment someone writes to chatmozg or starts a payment — even with mozg closed. Per browser: enable it on the laptop and the phone separately.")}</p>
          {env.VAPID_PUBLIC_KEY ? (
            <PushToggle
              vapidPublicKey={env.VAPID_PUBLIC_KEY}
              enabledNote="✓ this browser gets a notification for new messages and payments"
            />
          ) : (
            <p className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-3)", margin: 0 }}>
              {t("VAPID keys are not set — generate with `npx web-push generate-vapid-keys` and add to the env.")}</p>
          )}
        </Section>

        <Section title={t("mozgpay wallets")} aside={t("where the crypto lands")}>
          <p className="lede" style={{ marginBottom: ".75rem" }}>
            {t("Overrides the env addresses without a deploy. Empty field = fall back to env. Only NEW invoices use a changed address — open ones are watched at the address they were issued with.")}</p>
          <WalletsForm
            wallets={wallets.map((w) => ({
              field: w.field,
              label: w.label,
              value: wallet(w.field),
              envValue: w.envValue,
            }))}
          />
        </Section>

        <Section title={t("Money")} aside={t("the ledger, not the balances")}>
          <Stats>
            <Stat label={t("Topped up")} value={formatCents(money.topped_up)} />
            <Stat label={t("Spent")} value={formatCents(money.spent)} />
            <Stat label={t("To authors")} value={formatCents(money.to_authors)} />
            <Stat label={t("Our cut")} value={formatCents(money.platform_cut)} />
            <Stat label={t("Held by users")} value={formatCents(money.outstanding)} note={t("what we owe")} />
            <Stat label={t("Purchases")} value={String(money.purchases)} />
          </Stats>

          <div style={{ marginTop: "1.25rem" }}>
            <Rows empty={t("No movements yet. The first one will be a top-up.")}>
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
          <Section title={t("Brains with failed sources")} aside={`${attention.length} affected`}>
            <p className="lede" style={{ marginBottom: ".75rem" }}>
              {t("Fix the cause first — budget errors mean the owner's plan ran out of extraction money, so grant a plan or wait for the window — then requeue. Budget-paused sources also resume themselves on the next maintenance pass.")}</p>
            <Rows>
              {attention.map((b) => (
                <div key={b.id} className="row-block">
                  <Row
                    tint="red"
                    title={b.title}
                    sub={b.owner_email}
                    side={`${b.failed_sources} failed`}
                  />
                  <form action={requeueBrainSources} style={{ padding: "0 1.1rem .7rem" }}>
                    <input type="hidden" name="brain_id" value={b.id} />
                    <button type="submit">{markup(t("Requeue <0/> failed"), [
                      b.failed_sources,
                    ])}</button>
                  </form>
                </div>
              ))}
            </Rows>
          </Section>
        )}
      </div>
    </AppShell>
  );
}
