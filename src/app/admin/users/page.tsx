import { translator } from "@/lib/t";
import { fill, markup } from "@/lib/markup";
import AppShell from "@/components/AppShell";
import { requireAdmin, adminUsers } from "@/lib/admin";
import { formatCents } from "@/lib/money-math";
import { setPlan, adjustBalance, revokeTokens, deleteUser } from "../actions";
import MessageUserForm from "../MessageUserForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "People — admin", robots: { index: false, follow: false } };

/** A token used this recently means an agent is connected right now. */
const LIVE_MINUTES = 15;

export default async function AdminUsersPage() {
  const t = await translator();

  const admin = await requireAdmin();
  const users = await adminUsers();
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

                return (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.handle ?? u.email.split("@")[0]}</strong>
                      <span style={{ display: "block", color: "var(--ink-2)", fontSize: ".75rem" }}>
                        {u.email}
                        {!u.email_verified && t(" · unverified")}
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
