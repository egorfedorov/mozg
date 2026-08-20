import Link from "next/link";
import { query } from "@/db";
import AppShell from "@/components/AppShell";
import { translator } from "@/lib/t";
import { markup } from "@/lib/markup";
import { requireAdmin } from "@/lib/admin";
import { prices, priceRows } from "@/lib/genprice";
import { SETS } from "@/lib/slotgen";
import PriceForm from "./PriceForm";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await translator();
  return { title: t("gen — operator") };
}

/**
 * What the studio service charges, and what it has actually done.
 *
 * The margin is the number worth watching: the provider reports what each
 * picture cost us, so this page can show what was charged against what it took
 * rather than against an average somebody remembers.
 */
export default async function AdminGenPage() {
  await requireAdmin();
  const t = await translator();

  const [table, totals] = await Promise.all([
    prices(),
    query<{ status: string; assets: number; charged: number; cost: number }>(
      `select g.status,
              count(*)::int as assets,
              coalesce(sum(g.price_cents), 0)::int as charged,
              coalesce(sum(g.cost_cents), 0)::int as cost
         from generations g
        where g.pack_id is not null
        group by g.status
        order by 1`,
    ),
  ]);

  const setCosts = Object.fromEntries(
    Object.keys(SETS).map((id) => [id, SETS[id]().reduce((n, s) => n + (table[s.role] ?? 0), 0)]),
  ) as Record<string, number>;

  const done = totals.find((r) => r.status === "done");

  return (
    <AppShell active="/admin" title={t("Asset prices")}>
      <p className="eyebrow">
        {markup(t("<0>operator</0> · gen"), [<Link key="s0" href="/admin" />])}
      </p>
      <PriceForm rows={priceRows(table)} setCosts={setCosts} />

      <section style={{ marginTop: "2.5rem" }}>
        <h2>{t("What has been made")}</h2>
        {totals.length ? (
          <table style={{ width: "100%", maxWidth: "40rem", borderCollapse: "collapse" }}>
            <tbody>
              {totals.map((r) => (
                <tr key={r.status} style={{ borderTop: "1px solid var(--rule)" }}>
                  <td style={{ padding: ".4rem 0" }}>{r.status}</td>
                  <td style={{ textAlign: "right" }}>{r.assets}</td>
                  <td style={{ textAlign: "right" }}>${(r.charged / 100).toFixed(2)}</td>
                  <td style={{ textAlign: "right" }} className="muted">${(r.cost / 100).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">{t("No assets ordered yet.")}</p>
        )}
        {done ? (
          <p className="muted" style={{ marginTop: ".75rem" }}>
            {t("Delivered assets earned")} ${((done.charged - done.cost) / 100).toFixed(2)}{" "}
            {t("over what the model charged.")}
          </p>
        ) : null}
      </section>
    </AppShell>
  );
}
