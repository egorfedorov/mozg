import Link from "next/link";
import { redirect } from "next/navigation";
import { query } from "@/db";
import { currentUser } from "@/lib/session";
import { formatCents } from "@/lib/money-math";
import { topicLabel } from "@/lib/topics";
import AppShell from "@/components/AppShell";

export const dynamic = "force-dynamic";

export const metadata = { title: "Purchases — mozg" };

interface Bought {
  brain_id: string;
  title: string;
  slug: string;
  topic: string;
  owner_handle: string | null;
  price_cents: number;
  bought_at: string;
  /** Still there? An author can unpublish what you bought. */
  visibility: string;
  note_count: number;
}

interface Sold {
  brain_id: string;
  title: string;
  slug: string;
  sales: number;
  earned: number;
  last_sale: string;
}

export default async function PurchasesPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/settings/purchases");

  const [bought, sold] = await Promise.all([
    query<Bought>(
      `select p.brain_id, b.title, b.slug, b.topic, b.visibility, b.note_count,
              u.handle as owner_handle, p.price_cents,
              to_char(p.created_at at time zone 'UTC', 'YYYY-MM-DD') as bought_at
         from purchases p
         join brains b on b.id = p.brain_id
         join "user" u on u.id = b.owner_id
        where p.buyer_id = $1
        order by p.created_at desc`,
      [user.id],
    ),
    query<Sold>(
      `select p.brain_id, b.title, b.slug,
              count(*)::int as sales,
              sum(p.seller_cents)::int as earned,
              to_char(max(p.created_at) at time zone 'UTC', 'YYYY-MM-DD') as last_sale
         from purchases p join brains b on b.id = p.brain_id
        where p.seller_id = $1
        group by p.brain_id, b.title, b.slug
        order by sum(p.seller_cents) desc`,
      [user.id],
    ),
  ]);

  return (
    <AppShell active="/settings/purchases" eyebrow={user.email} title="Purchases & sales">
      <section>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: ".75rem",
          }}
        >
          <h2 className="display" style={{ fontSize: "1.375rem" }}>
            Brains you bought
          </h2>
          {bought.length > 0 && (
            <span className="eyebrow">
              {formatCents(bought.reduce((n, b) => n + b.price_cents, 0))} in total
            </span>
          )}
        </div>

        {bought.length === 0 ? (
          <div className="panel">
            <p style={{ margin: 0, color: "var(--ink-2)" }}>
              Nothing yet. A bought brain connects to your agent exactly like your
              own — one token reaches everything you can read.{" "}
              <Link href="/explore?price=paid" style={{ textDecoration: "underline" }}>
                See what is on sale
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="panel" style={{ padding: 0 }}>
            {bought.map((b) => (
              <div
                key={b.brain_id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: "1rem",
                  padding: ".85rem 1.25rem",
                  borderBottom: "1px solid var(--rule)",
                  alignItems: "center",
                }}
              >
                <span>
                  {b.owner_handle && b.visibility === "public" ? (
                    <Link href={`/b/${b.owner_handle}/${b.slug}`} style={{ fontWeight: 600 }}>
                      {b.title}
                    </Link>
                  ) : (
                    <strong>{b.title}</strong>
                  )}
                  <span
                    className="mono"
                    style={{ display: "block", fontSize: ".6875rem", color: "var(--ink-3)" }}
                  >
                    {topicLabel(b.topic)} · {b.owner_handle ?? "—"} · {b.note_count} notes ·
                    bought {b.bought_at}
                    {b.visibility !== "public" && " · author unpublished it"}
                  </span>
                </span>
                <span className="mono" style={{ whiteSpace: "nowrap" }}>
                  {formatCents(b.price_cents)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: "2.5rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: ".75rem",
          }}
        >
          <h2 className="display" style={{ fontSize: "1.375rem" }}>
            Brains you sold
          </h2>
          {sold.length > 0 && (
            <span className="eyebrow">
              {formatCents(sold.reduce((n, s) => n + s.earned, 0))} earned
            </span>
          )}
        </div>

        {sold.length === 0 ? (
          <div className="panel">
            <p style={{ margin: 0, color: "var(--ink-2)" }}>
              No sales yet. A brain has to be public and priced before anyone can
              buy it — the price field is on its sharing page, next to the licence.
            </p>
          </div>
        ) : (
          <div className="panel" style={{ padding: 0 }}>
            {sold.map((s) => (
              <div
                key={s.brain_id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: "1rem",
                  padding: ".85rem 1.25rem",
                  borderBottom: "1px solid var(--rule)",
                  alignItems: "center",
                }}
              >
                <span>
                  <Link href={`/brains/${s.slug}`} style={{ fontWeight: 600 }}>
                    {s.title}
                  </Link>
                  <span
                    className="mono"
                    style={{ display: "block", fontSize: ".6875rem", color: "var(--ink-3)" }}
                  >
                    {s.sales} sale{s.sales === 1 ? "" : "s"} · last {s.last_sale}
                  </span>
                </span>
                <span
                  className="mono"
                  style={{ whiteSpace: "nowrap", color: "var(--color-riso-green)" }}
                >
                  +{formatCents(s.earned)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
