import { Fragment } from "react";
import { translator } from "@/lib/t";
import { fill, markup } from "@/lib/markup";
import AppShell from "@/components/AppShell";
import {
  requireAdmin,
  adminUsers,
  adminUserMovements,
  adminOpenInvoices,
  type AdminOpenInvoice,
} from "@/lib/admin";
import { formatCents } from "@/lib/money-math";
import { setPlan, adjustBalance, revokeTokens, deleteUser, markTopupReceived } from "../actions";
import MessageUserForm from "../MessageUserForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "People — admin", robots: { index: false, follow: false } };

/** A token used this recently means an agent is connected right now. */
const LIVE_MINUTES = 15;

export default async function AdminUsersPage() {
  const t = await translator();

  const admin = await requireAdmin();
  const users = await adminUsers();
  // One query for every account's money, grouped here — the alternative is a
  // query per row, and this table renders two hundred of them.
  const movements = await adminUserMovements(users.map((u) => u.id));
  const invoices = await adminOpenInvoices(users.map((u) => u.id));
  const unsettled = new Map<string, AdminOpenInvoice[]>();
  for (const i of invoices) {
    const list = unsettled.get(i.user_id) ?? [];
    list.push(i);
    unsettled.set(i.user_id, list);
  }
  const history = new Map<string, typeof movements>();
  for (const m of movements) {
    const list = history.get(m.user_id);
    if (list) list.push(m);
    else history.set(m.user_id, [m]);
  }
  // A server component renders once per request, so the clock cannot drift
  // between renders the way the purity rule guards against on the client.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  return (
    <AppShell active="/admin/users" eyebrow={t("Operator")} title={t("People")}>
      <p className="lede">
          {markup(
            users.length === 1
              ? t("<0/> account. MCP is shown as live when a token was used in the last <1/> minutes — that is the only honest signal, since MCP has no session to stay open.")
              : t("<0/> accounts. MCP is shown as live when a token was used in the last <1/> minutes — that is the only honest signal, since MCP has no session to stay open."),
            [users.length, LIVE_MINUTES],
          )}</p>

        <div className="adm-scroll" style={{ marginTop: "1rem" }}>
          <table className="adm">
            <thead>
              <tr>
                <th>{t("Account")}</th>
                <th>{t("MCP")}</th>
                <th style={{ textAlign: "right" }}>{t("Brains")}</th>
                <th style={{ textAlign: "right" }}>{t("Notes")}</th>
                <th style={{ textAlign: "right" }}>{t("Calls 7d")}</th>
                <th>{t("Plan")}</th>
                <th style={{ textAlign: "right" }}>{t("Paid in")}</th>
                <th style={{ textAlign: "right" }}>{t("Spent")}</th>
                <th style={{ textAlign: "right" }}>{t("Balance")}</th>
                <th>{t("Adjust")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const live =
                  !!u.last_call && now - new Date(u.last_call).getTime() < LIVE_MINUTES * 60_000;
                const state = u.tokens === 0 ? "idle" : live ? "ok" : "down";
                const canDelete =
                  u.id !== admin.id && u.balance_cents === 0 && u.brains === 0;

                const spending = history.get(u.id) ?? [];

                return (
                  <Fragment key={u.id}>
                  <tr>
                    <td>
                      <strong>{u.handle ?? u.email.split("@")[0]}</strong>
                      <span style={{ display: "block", color: "var(--ink-2)", fontSize: ".75rem" }}>
                        {u.email}
                        {!u.email_verified && t(" · unverified")}
                        {/* Where this account came from. Blank on the 36 that
                            arrived before anything recorded it. */}
                        {u.signup_source && ` · ${u.signup_source}`}
                      </span>
                      <MessageUserForm userId={u.id} label="→" />
                    </td>

                    <td>
                      <span style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
                        <span className="dot" data-state={state} />
                        <span className="mono" style={{ fontSize: ".6875rem" }}>
                          {u.tokens === 0
                            ? t("no token")
                            : live
                              ? "live"
                              : u.last_call
                                ? new Date(u.last_call).toISOString().slice(0, 10)
                                : t("never used")}
                        </span>
                      </span>
                    </td>

                    <td className="num">{u.brains}</td>
                    <td className="num">{u.notes}</td>
                    <td className="num">{u.calls_week}</td>

                    <td>
                      <form action={setPlan} style={{ display: "flex", gap: ".3rem" }}>
                        <input type="hidden" name="id" value={u.id} />
                        <select name="plan" defaultValue={u.plan}>
                          <option value="free">{t("free")}</option>
                          <option value="pro">{t("pro")}</option>
                          <option value="team">{t("team")}</option>
                        </select>
                        <button type="submit">{t("Set")}</button>
                      </form>
                    </td>

                    <td className="num">
                      {u.topped_up_cents ? formatCents(u.topped_up_cents) : "—"}
                    </td>
                    <td className="num">{u.spent_cents ? formatCents(u.spent_cents) : "—"}</td>
                    <td className="num">{formatCents(u.balance_cents)}</td>

                    <td>
                      <form action={adjustBalance} style={{ display: "flex", gap: ".3rem" }}>
                        <input type="hidden" name="id" value={u.id} />
                        <input
                          name="amount"
                          type="text"
                          inputMode="decimal"
                          placeholder="±$"
                          size={5}
                          aria-label={fill(t("Adjust balance for <0/>"), [u.email])}
                        />
                        <input name="note" type="text" placeholder="why" size={8} />
                        <button type="submit">{t("Apply")}</button>
                      </form>
                    </td>

                    <td>
                      <span style={{ display: "flex", gap: ".3rem" }}>
                        {u.tokens > 0 && (
                          <form action={revokeTokens}>
                            <input type="hidden" name="id" value={u.id} />
                            <button type="submit" data-danger="true">
                              {markup(t("Revoke <0/>"), [
                              u.tokens,
                            ])}</button>
                          </form>
                        )}
                        {canDelete && (
                          <form action={deleteUser}>
                            <input type="hidden" name="id" value={u.id} />
                            <button type="submit" data-danger="true">
                              {t("Delete")}</button>
                          </form>
                        )}
                      </span>
                    </td>
                  </tr>

                  {(unsettled.get(u.id) ?? []).length > 0 && (
                    <tr>
                      {/* Started and never settled. Sits above the ledger
                          because it is the only part of this table that is a
                          question rather than a record: did this money
                          actually arrive? */}
                      <td colSpan={11} style={{ paddingTop: 0 }}>
                        <div
                          className="mono"
                          style={{ fontSize: ".75rem", display: "grid", gap: ".35rem" }}
                        >
                          {(unsettled.get(u.id) ?? []).map((i) => (
                            <div
                              key={i.reference}
                              style={{ display: "flex", gap: ".6rem", alignItems: "center", flexWrap: "wrap" }}
                            >
                              <span style={{ color: "var(--color-riso-red)" }}>
                                {t("unsettled")}</span>
                              <span style={{ color: "var(--ink-3)" }}>{i.created_at}</span>
                              <span>{formatCents(i.amount_cents)}</span>
                              <span style={{ color: "var(--ink-2)" }}>
                                {i.pay_amount ?? ""} {i.pay_coin ?? ""} · {i.status}
                              </span>
                              <form
                                action={markTopupReceived}
                                style={{ display: "flex", gap: ".3rem", marginLeft: "auto" }}
                              >
                                <input type="hidden" name="reference" value={i.reference} />
                                <input
                                  className="mono"
                                  name="txId"
                                  placeholder={t("tx hash (optional)")}
                                  aria-label={fill(t("Transaction for <0/>"), [i.reference])}
                                  style={{ width: "13rem", fontSize: ".75rem" }}
                                />
                                <button className="btn btn-ghost" style={{ fontSize: ".75rem" }}>
                                  {t("money arrived")}</button>
                              </form>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                  {spending.length > 0 && (
                    <tr>
                      {/* Its own row rather than a cell in the one above: a
                          <details> cannot wrap table rows, and the history
                          needs the full width to stay readable. */}
                      <td colSpan={11} style={{ paddingTop: 0 }}>
                        <details>
                          <summary className="mono" style={{ fontSize: ".75rem", cursor: "pointer" }}>
                            {markup(t("Money · <0/> movements"), [spending.length])}</summary>
                          <ul
                            className="mono"
                            style={{
                              listStyle: "none",
                              margin: ".5rem 0 0",
                              padding: 0,
                              fontSize: ".75rem",
                              display: "grid",
                              gap: ".25rem",
                            }}
                          >
                            {spending.map((m) => (
                              <li key={m.id} style={{ display: "flex", gap: ".6rem" }}>
                                <span style={{ color: "var(--ink-3)" }}>
                                  {m.created_at.slice(0, 10)}</span>
                                <span
                                  style={{
                                    minWidth: "5.5rem",
                                    textAlign: "right",
                                    color: m.amount_cents < 0 ? "var(--ink)" : "var(--ink-2)",
                                  }}
                                >
                                  {m.amount_cents < 0 ? "−" : "+"}
                                  {formatCents(Math.abs(m.amount_cents))}
                                </span>
                                <span>{m.kind}</span>
                                {/* What the money bought, which is the whole
                                    point — the brain if it was a purchase, the
                                    note if a human moved it by hand. */}
                                <span style={{ color: "var(--ink-2)" }}>
                                  {m.brain_slug ? (
                                    <a href={`/brains/${m.brain_slug}`}>{m.brain_title}</a>
                                  ) : (
                                    (m.note ?? "")
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", marginTop: "1rem" }}>
          {t("Deleting is only offered for accounts with no brains and no balance. Anyone who has bought or sold something stays — their ledger is the record.")}</p>
      </AppShell>
  );
}
