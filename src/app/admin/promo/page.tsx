import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { query } from "@/db";
import { requireAdmin } from "@/lib/admin";
import { mintPromo } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Promo — mozg admin" };

/**
 * Minting and watching promo codes. A code is percent-off on a plan month
 * (100 = the free month); the checkout applies the better of code and
 * founding, never both.
 */
export default async function AdminPromoPage() {
  await requireAdmin().catch(() => redirect("/"));

  const codes = await query<{
    code: string;
    percent_off: number;
    max_uses: number;
    used: number;
    expires_at: string | null;
    note: string | null;
  }>(
    `select c.code, c.percent_off, c.max_uses, c.note,
            to_char(c.expires_at at time zone 'UTC', 'YYYY-MM-DD') as expires_at,
            (select count(*)::int from promo_redemptions r where r.code = c.code) as used
       from promo_codes c order by c.created_at desc limit 100`,
  );

  return (
    <AppShell active="/admin/promo" eyebrow="Operator" title="Promo codes">
      <form
        action={mintPromo}
        style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "1.5rem" }}
      >
        <label className="mono" style={{ fontSize: ".75rem" }}>
          percent off
          <input name="percent" type="number" min={1} max={100} defaultValue={20} required
            style={{ display: "block", width: "6rem", padding: ".45rem .6rem", border: "1.5px solid var(--ink)", background: "var(--paper)", font: "inherit" }} />
        </label>
        <label className="mono" style={{ fontSize: ".75rem" }}>
          max uses
          <input name="uses" type="number" min={1} max={10000} defaultValue={10} required
            style={{ display: "block", width: "6rem", padding: ".45rem .6rem", border: "1.5px solid var(--ink)", background: "var(--paper)", font: "inherit" }} />
        </label>
        <label className="mono" style={{ fontSize: ".75rem" }}>
          days valid (empty = forever)
          <input name="days" type="number" min={1} max={365}
            style={{ display: "block", width: "8rem", padding: ".45rem .6rem", border: "1.5px solid var(--ink)", background: "var(--paper)", font: "inherit" }} />
        </label>
        <label className="mono" style={{ fontSize: ".75rem", flex: 1, minWidth: 160 }}>
          note (who is it for)
          <input name="note" placeholder="HN launch"
            style={{ display: "block", width: "100%", padding: ".45rem .6rem", border: "1.5px solid var(--ink)", background: "var(--paper)", font: "inherit" }} />
        </label>
        <button className="btn">Mint code</button>
      </form>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9375rem" }}>
        <thead>
          <tr className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)", textAlign: "left" }}>
            <th style={{ padding: ".4rem .6rem" }}>code</th>
            <th style={{ padding: ".4rem .6rem" }}>off</th>
            <th style={{ padding: ".4rem .6rem" }}>used</th>
            <th style={{ padding: ".4rem .6rem" }}>expires</th>
            <th style={{ padding: ".4rem .6rem" }}>note</th>
          </tr>
        </thead>
        <tbody>
          {codes.map((c) => (
            <tr key={c.code} style={{ borderTop: "1px solid var(--rule)" }}>
              <td className="mono" style={{ padding: ".45rem .6rem", fontWeight: 650 }}>{c.code}</td>
              <td className="mono" style={{ padding: ".45rem .6rem" }}>
                {c.percent_off === 100 ? "free month" : `−${c.percent_off}%`}
              </td>
              <td className="mono" style={{ padding: ".45rem .6rem" }}>
                <span style={{ color: c.used >= c.max_uses ? "var(--color-riso-red)" : "inherit" }}>
                  {c.used}/{c.max_uses}
                </span>
              </td>
              <td className="mono" style={{ padding: ".45rem .6rem" }}>{c.expires_at ?? "—"}</td>
              <td style={{ padding: ".45rem .6rem", color: "var(--ink-2)" }}>{c.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {codes.length === 0 && (
        <p style={{ color: "var(--ink-2)" }}>No codes yet — mint the first one above.</p>
      )}
    </AppShell>
  );
}
