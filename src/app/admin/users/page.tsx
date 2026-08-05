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
  const admin = await requireAdmin();
  const users = await adminUsers();
  // A server component renders once per request, so the clock cannot drift
  // between renders the way the purity rule guards against on the client.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  return (
    <AppShell active="/admin/users" eyebrow="Operator" title="People">
      <p className="lede">
          {users.length} account{users.length === 1 ? "" : "s"}. MCP is shown as live
          when a token was used in the last {LIVE_MINUTES} minutes — that is the
          only honest signal, since MCP has no session to stay open.
        </p>

        <div className="adm-scroll" style={{ marginTop: "1rem" }}>
          <table className="adm">
            <thead>
              <tr>
                <th>Account</th>
                <th>MCP</th>
                <th style={{ textAlign: "right" }}>Brains</th>
                <th style={{ textAlign: "right" }}>Notes</th>
                <th style={{ textAlign: "right" }}>Calls 7d</th>
                <th>Plan</th>
                <th style={{ textAlign: "right" }}>Balance</th>
                <th>Adjust</th>
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
                        {!u.email_verified && " · unverified"}
                      </span>
                      <MessageUserForm userId={u.id} label="→" />
                    </td>

                    <td>
                      <span style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
                        <span className="dot" data-state={state} />
                        <span className="mono" style={{ fontSize: ".6875rem" }}>
                          {u.tokens === 0
                            ? "no token"
                            : live
                              ? "live"
                              : u.last_call
                                ? new Date(u.last_call).toISOString().slice(0, 10)
                                : "never used"}
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
                          <option value="free">free</option>
                          <option value="pro">pro</option>
                          <option value="team">team</option>
                        </select>
                        <button type="submit">Set</button>
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
                          aria-label={`Adjust balance for ${u.email}`}
                        />
                        <input name="note" type="text" placeholder="why" size={8} />
                        <button type="submit">Apply</button>
                      </form>
                    </td>

                    <td>
                      <span style={{ display: "flex", gap: ".3rem" }}>
                        {u.tokens > 0 && (
                          <form action={revokeTokens}>
                            <input type="hidden" name="id" value={u.id} />
                            <button type="submit" data-danger="true">
                              Revoke {u.tokens}
                            </button>
                          </form>
                        )}
                        {canDelete && (
                          <form action={deleteUser}>
                            <input type="hidden" name="id" value={u.id} />
                            <button type="submit" data-danger="true">
                              Delete
                            </button>
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
          Deleting is only offered for accounts with no brains and no balance.
          Anyone who has bought or sold something stays — their ledger is the
          record.
        </p>
      </AppShell>
  );
}
