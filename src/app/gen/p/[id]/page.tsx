import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import { translator } from "@/lib/t";
import { fill } from "@/lib/markup";
import { currentUser } from "@/lib/session";
import { readProject, syncItems } from "@/lib/genproject";
import { prices, priceOf } from "@/lib/genprice";
import { formatCents } from "@/lib/money-math";
import { one } from "@/db";
import ItemRow from "./ItemRow";
import RunButton from "./RunButton";
import WhileDrawing from "./WhileDrawing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Project — gen" };

/**
 * One game's folder.
 *
 * The screen the old flow never had: the set as a list you can read, with every
 * asset's own instruction next to it and a price on the run. A studio decides
 * here — rewrites the premium, throws away a symbol it does not want, leaves
 * the rest to the world it already described — and none of it costs anything
 * until the run button.
 */
export default async function GenProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await translator();
  const { id } = await params;

  const user = await currentUser();
  if (!user) redirect(`/sign-in?next=/gen/p/${id}`);

  // The worker settles generations and knows nothing about projects — a
  // dependency pointing that way would make the queue import the cabinet. So
  // the items catch up with their own generations whenever this page opens.
  await syncItems(id);

  const [read, table, balance] = await Promise.all([
    readProject(id, user.id),
    prices(),
    one<{ balance_cents: number }>(`select balance_cents from "user" where id = $1`, [user.id]),
  ]);
  if (!read) notFound();

  const { project, items } = read;
  const planned = items.filter((i) => i.status === "planned");
  const runCost = planned.reduce((n, i) => n + priceOf(table, i.role), 0);

  return (
    <>
      <TopBar />

      <WhileDrawing active={items.some((i) => i.status === "generating")} />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3rem)" }}>
        <Link className="mono" href="/gen/panel" style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>
          {t("← all games")}
        </Link>

        <h1 className="display" style={{ fontSize: "clamp(1.8rem, 4.5vw, 2.8rem)", margin: ".5rem 0 .75rem" }}>
          {project.title}
        </h1>
        <p className="lede">{project.style ?? t("No world described yet.")}</p>
        {project.palette && (
          <p className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-3)", margin: "0 0 1.5rem" }}>
            {project.palette}
          </p>
        )}

        {/* The price of the run, before the run. A studio should never have to
            add up thirteen prices to find out what a button does. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem 1.5rem",
            flexWrap: "wrap",
            border: "1.5px solid var(--ink)",
            background: "var(--color-riso-yellow)",
            padding: "1rem 1.25rem",
            marginBottom: "2rem",
          }}
        >
          <span style={{ minWidth: 0 }}>
            <strong className="display" style={{ fontSize: "1.5rem", display: "block" }}>
              {planned.length ? formatCents(runCost) : t("nothing planned")}
            </strong>
            <span className="mono" style={{ fontSize: ".75rem" }}>
              {planned.length
                ? fill(t("<0/> assets · balance <1/>"), [planned.length, formatCents(balance.balance_cents)])
                : t("every asset here has been generated")}
            </span>
          </span>
          <span style={{ marginLeft: "auto" }}>
            <RunButton
              projectId={project.id}
              count={planned.length}
              affordable={balance.balance_cents >= runCost}
            />
          </span>
        </div>

        <div className="section-head">
          <h2 className="h2">{t("The set")}</h2>
          <span className="eyebrow">{t("empty description = drawn from the world above")}</span>
        </div>

        <div style={{ display: "grid", gap: ".75rem" }}>
          {items.map((item) => (
            <ItemRow
              key={item.id}
              projectId={project.id}
              item={{
                label: item.label,
                role: item.role,
                spec: item.spec,
                status: item.status,
                generationId: item.generation_id,
                hasImage: Boolean(item.storage_key),
              }}
              priceCents={priceOf(table, item.role)}
            />
          ))}
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
