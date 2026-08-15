import Link from "next/link";
import { redirect } from "next/navigation";
import { one } from "@/db";
import AppShell from "@/components/AppShell";
import { translator } from "@/lib/t";
import { currentUser } from "@/lib/session";
import { packsOf } from "@/lib/assetpacks";
import { prices, priceRows } from "@/lib/genprice";
import { SETS } from "@/lib/slotgen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Studio — gen" };

/**
 * The studio's own room.
 *
 * Same shell as the rest of the account, because it is the same account: the
 * balance here is the balance everywhere, and a studio that tops up for art
 * can spend it on a brain tomorrow. What is specific to gen is what it costs
 * today and what has been ordered — both of which a studio checks far more
 * often than it changes its profile.
 */
export default async function GenAccountPage() {
  const t = await translator();

  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/gen/account");

  const [packs, table, spend] = await Promise.all([
    packsOf(user.id, 50),
    prices(),
    one<{ balance_cents: number; assets: number; spent_cents: number }>(
      `select
         (select balance_cents from "user" where id = $1) as balance_cents,
         (select count(*)::int from generations g
            join asset_packs p on p.id = g.pack_id
           where p.owner_id = $1) as assets,
         (select coalesce(sum(g.price_cents), 0)::int from generations g
            join asset_packs p on p.id = g.pack_id
           where p.owner_id = $1 and g.status = 'done') as spent_cents`,
      [user.id],
    ),
  ]);

  const setCost = (id: string) =>
    SETS[id]().reduce((n, s) => n + (table[s.role] ?? 0), 0);

  return (
    <AppShell active="/gen/account" eyebrow={user.email} title={t("Studio")}>
      <p className="lede" style={{ maxWidth: "60ch" }}>
        {t("Art for slot games, priced per asset and paid from your account balance — the same balance the rest of mozg uses.")}
      </p>

      <section style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", margin: "1.5rem 0" }}>
        <div className="card" style={{ padding: "1rem" }}>
          <p className="eyebrow">{t("Balance")}</p>
          <p style={{ fontSize: "1.6rem", margin: ".2rem 0" }}>${(spend.balance_cents / 100).toFixed(2)}</p>
          <Link href="/settings/topup">{t("Top up")}</Link>
        </div>
        <div className="card" style={{ padding: "1rem" }}>
          <p className="eyebrow">{t("Assets made")}</p>
          <p style={{ fontSize: "1.6rem", margin: ".2rem 0" }}>{spend.assets}</p>
        </div>
        <div className="card" style={{ padding: "1rem" }}>
          <p className="eyebrow">{t("Spent on art")}</p>
          <p style={{ fontSize: "1.6rem", margin: ".2rem 0" }}>${(spend.spent_cents / 100).toFixed(2)}</p>
        </div>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2>{t("Today's prices")}</h2>
        <table style={{ width: "100%", maxWidth: "40rem", borderCollapse: "collapse" }}>
          <tbody>
            {priceRows(table).map((r) => (
              <tr key={r.role} style={{ borderTop: "1px solid var(--rule)" }}>
                <td style={{ padding: ".4rem 0" }}>{r.summary}</td>
                <td style={{ textAlign: "right" }}>${(r.cents / 100).toFixed(2)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: "1px solid var(--rule)" }}>
              <td style={{ padding: ".4rem 0" }}><strong>{t("A full game — 13 assets")}</strong></td>
              <td style={{ textAlign: "right" }}><strong>${(setCost("full") / 100).toFixed(2)}</strong></td>
            </tr>
          </tbody>
        </table>
        <p style={{ marginTop: "1rem" }}>
          <Link href="/gen">{t("Order a set →")}</Link>
        </p>
      </section>

      <section>
        <h2>{t("Packs")}</h2>
        {packs.length ? (
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: ".5rem" }}>
            {packs.map((p) => (
              <li key={p.id} style={{ borderTop: "1px solid var(--rule)", paddingTop: ".5rem" }}>
                <Link href={`/gen/${p.id}`}>{p.title}</Link>{" "}
                <span className="muted" style={{ fontSize: ".85em" }}>
                  {p.done}/{p.total} · {p.created_at}
                  {p.failed ? ` · ${p.failed} failed and refunded` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t("Nothing ordered yet.")}</p>
        )}
      </section>
    </AppShell>
  );
}
