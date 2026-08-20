import Link from "next/link";
import { redirect } from "next/navigation";
import { one } from "@/db";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import { translator } from "@/lib/t";
import { markup, fill } from "@/lib/markup";
import { currentUser } from "@/lib/session";
import { packsOf } from "@/lib/assetpacks";
import { prices, priceRows } from "@/lib/genprice";
import { SETS } from "@/lib/slotgen";
import { listProjects, KINDS } from "@/lib/genproject";
import ProjectStart from "./ProjectStart";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await translator();
  return { title: t("Panel — gen") };
}

/**
 * gen.mozg.sh/panel — the studio's own room.
 *
 * One account, two products. The balance here is the balance on mozg.sh —
 * topped up in one place, spendable on art or on a brain — because splitting
 * it would mean two wallets, two top-up flows and a support question every
 * time somebody guesses wrong about which one they funded.
 *
 * What lives here is only what belongs to generation: what a set costs today,
 * what has been ordered, and where each pack got to. Everything about the
 * account itself is one link away, on the page that already owns it.
 */
export default async function GenPanelPage() {
  const t = await translator();

  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/gen/panel");

  const [packs, table, totals, projects] = await Promise.all([
    packsOf(user.id, 50),
    prices(),
    one<{ balance_cents: number; assets: number; spent_cents: number; packs: number }>(
      `select
         (select balance_cents from "user" where id = $1) as balance_cents,
         (select count(*)::int from asset_packs where owner_id = $1) as packs,
         (select count(*)::int from generations g
            join asset_packs p on p.id = g.pack_id
           where p.owner_id = $1 and g.status = 'done') as assets,
         (select coalesce(sum(g.price_cents), 0)::int from generations g
            join asset_packs p on p.id = g.pack_id
           where p.owner_id = $1 and g.status = 'done') as spent_cents`,
      [user.id],
    ),
    listProjects(user.id),
  ]);

  const setCost = (id: string) => SETS[id]().reduce((n, s) => n + (table[s.role] ?? 0), 0);
  const sets = [
    { id: "full", label: t("Full game"), note: t("11 symbols · background · lobby tile") },
    { id: "symbols", label: t("Symbols only"), note: t("the paytable ladder") },
    { id: "scene", label: t("Scene"), note: t("background · tile · reel frame") },
  ];

  return (
    <>
      <TopBar />

      <main className="shell" style={{ paddingBlock: "clamp(2.5rem, 7vw, 4rem)" }}>
        <p className="eyebrow">{t("gen · panel")}</p>
        <h1 className="display" style={{ fontSize: "clamp(1.8rem, 4.5vw, 2.8rem)", margin: ".4rem 0 1.5rem" }}>
          {user.email}
        </h1>

        <section
          style={{
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            marginBottom: "2.5rem",
          }}
        >
          <div className="panel">
            <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)", margin: 0 }}>
              {t("Balance")}
            </p>
            <p className="display" style={{ fontSize: "1.9rem", margin: ".25rem 0 .5rem" }}>
              ${(totals.balance_cents / 100).toFixed(2)}
            </p>
            {/* One wallet, and it lives on the main site — this is a link to it,
                not a second copy of it. */}
            <a className="mono" style={{ fontSize: ".8125rem" }} href="https://mozg.sh/settings/balance">
              {t("Top up and history →")}
            </a>
          </div>

          <div className="panel">
            <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)", margin: 0 }}>
              {t("Assets made")}
            </p>
            <p className="display" style={{ fontSize: "1.9rem", margin: ".25rem 0 .5rem" }}>{totals.assets}</p>
            <span className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>
              {t("in")} {totals.packs} {t("packs")}
            </span>
          </div>

          <div className="panel">
            <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)", margin: 0 }}>
              {t("Spent on art")}
            </p>
            <p className="display" style={{ fontSize: "1.9rem", margin: ".25rem 0 .5rem" }}>
              ${(totals.spent_cents / 100).toFixed(2)}
            </p>
            <span className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>
              {t("failed assets refund themselves")}
            </span>
          </div>
        </section>

        {/* Projects first. The old panel opened with prices and a set-picker,
            which answers "what does it cost" to somebody who came to ask "where
            is my game". Work you already have is the reason you are here. */}
        <section style={{ marginBottom: "2.5rem" }}>
          <div className="section-head">
            <h2 className="h2">{t("Your games")}</h2>
            <span className="eyebrow">{t("a folder each · plan free, pay to generate")}</span>
          </div>

          {projects.length > 0 && (
            <div className="rows" style={{ marginBottom: "1rem" }}>
              {projects.map((p) => (
                <Link className="row" key={p.id} href={`/gen/p/${p.id}`}>
                  <span style={{ minWidth: 0 }}>
                    <strong>{p.title}</strong>
                    <span className="row-sub">
                      {p.style ?? t("no world described yet")}
                    </span>
                    <span className="row-meta">
                      {fill(t("<0/> planned · <1/> generated"), [p.planned, p.done])}
                    </span>
                  </span>
                  <span className="row-side">→</span>
                </Link>
              ))}
            </div>
          )}

          <ProjectStart hasProjects={projects.length > 0} kinds={KINDS} />
        </section>

        <section style={{ marginBottom: "2.5rem" }}>
          <p className="eyebrow">{t("Today's prices")}</p>
          <div className="panel" style={{ marginTop: ".75rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {priceRows(table).map((r) => (
                  <tr key={r.role} style={{ borderTop: "1px solid var(--rule-color, rgba(0,0,0,.12))" }}>
                    <td style={{ padding: ".45rem 0" }}>{r.summary}</td>
                    <td className="mono" style={{ textAlign: "right" }}>${(r.cents / 100).toFixed(2)}</td>
                  </tr>
                ))}
                {sets.map((s) => (
                  <tr key={s.id} style={{ borderTop: "1px solid var(--rule-color, rgba(0,0,0,.12))" }}>
                    <td style={{ padding: ".45rem 0" }}>
                      <strong>{s.label}</strong>{" "}
                      <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)" }}>{s.note}</span>
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      <strong>${(setCost(s.id) / 100).toFixed(2)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: "1rem" }}>
            <Link className="btn" href="/gen#order">{t("Order a set")}</Link>
          </p>
        </section>

        <section>
          <p className="eyebrow">{t("Packs")}</p>
          {packs.length ? (
            <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: ".5rem", marginTop: ".75rem" }}>
              {packs.map((p) => (
                <li
                  key={p.id}
                  className="panel"
                  style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", alignItems: "baseline" }}
                >
                  <span>
                    <Link href={`/gen/${p.id}`}>{p.title}</Link>{" "}
                    <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)" }}>
                      {p.created_at}
                    </span>
                  </span>
                  <span className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>
                    {p.done}/{p.total}
                    {p.failed ? ` · ${p.failed} refunded` : ""}
                    {p.done ? (
                      <>
                        {" · "}
                        <a href={`/api/packs/${p.id}/export`} download>{t("zip")}</a>
                      </>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="lede" style={{ maxWidth: "60ch" }}>
              {markup(t("Nothing ordered yet. <0>Describe a game</0> and the set comes back in about ten minutes."), [
                <Link key="s0" href="/gen#order" />,
              ])}
            </p>
          )}
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
