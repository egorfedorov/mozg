import Link from "next/link";
import { redirect } from "next/navigation";
import { query } from "@/db";
import { currentUser } from "@/lib/session";
import { formatCents } from "@/lib/money-math";
import { topicLabel } from "@/lib/topics";
import AppShell from "@/components/AppShell";
import { Section, Rows, Row } from "@/components/ui";
import { libraryBrains } from "@/lib/library";
import { dropBrain } from "@/app/b/[handle]/[slug]/library-action";

export const dynamic = "force-dynamic";

export const metadata = { title: "Library — mozg" };

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

  const [bought, sold, library] = await Promise.all([
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
    libraryBrains(user.id),
  ]);

  return (
    <AppShell active="/settings/purchases" eyebrow={user.email} title="Your brain library">
      <div className="stack">
        <Section
          title="Added from the catalogue"
          aside={library.length ? `${library.length} in your set` : undefined}
        >
          <p className="lede" style={{ marginBottom: ".75rem" }}>
            These appear in the list your agents read. Nothing was copied to
            your machine — each stays with its author and keeps improving as
            they add to it.
          </p>
          <Rows
            empty={
              <>
                Nothing added yet.{" "}
                <Link href="/explore" style={{ textDecoration: "underline" }}>
                  Browse the catalogue
                </Link>{" "}
                and add a brain; your agents see it immediately.
              </>
            }
          >
            {library.map((b) => (
              <Row
                key={b.id}
                href={`/b/${b.owner_handle}/${b.slug}`}
                title={b.title}
                sub={b.still_public ? undefined : "the author unpublished it — your agents can no longer read it"}
                meta={`${b.handle} · ${b.note_count} notes · ${b.score === null ? "not examined" : `trained ${b.score}%`} · added ${b.added_at}`}
                side={
                  <form action={dropBrain}>
                    <input type="hidden" name="brainId" value={b.id} />
                    <button className="linkish">remove</button>
                  </form>
                }
              />
            ))}
          </Rows>
        </Section>

        <Section
          title="Brains you bought"
          aside={
            bought.length > 0
              ? `${formatCents(bought.reduce((n, b) => n + b.price_cents, 0))} in total`
              : undefined
          }
        >
          <Rows
            empty={
              <>
                Nothing yet. A bought brain connects to your agent exactly like
                your own — one token reaches everything you can read.{" "}
                <Link href="/explore?price=paid" style={{ textDecoration: "underline" }}>
                  See what is on sale
                </Link>
                .
              </>
            }
          >
            {bought.map((b) => (
              <Row
                key={b.brain_id}
                href={
                  b.owner_handle && b.visibility === "public"
                    ? `/b/${b.owner_handle}/${b.slug}`
                    : undefined
                }
                title={b.title}
                meta={`${topicLabel(b.topic)} · ${b.owner_handle ?? "—"} · ${b.note_count} notes · bought ${b.bought_at}${
                  b.visibility !== "public" ? " · author unpublished it" : ""
                }`}
                side={formatCents(b.price_cents)}
              />
            ))}
          </Rows>
        </Section>

        <Section
          title="Brains you sold"
          aside={
            sold.length > 0
              ? `${formatCents(sold.reduce((n, s) => n + s.earned, 0))} earned`
              : undefined
          }
        >
          <Rows empty="No sales yet. A brain has to be public and priced before anyone can buy it — the price field is on its sharing page, next to the licence.">
            {sold.map((s) => (
              <Row
                key={s.brain_id}
                href={`/brains/${s.slug}`}
                title={s.title}
                meta={`${s.sales} sale${s.sales === 1 ? "" : "s"} · last ${s.last_sale}`}
                side={`+${formatCents(s.earned)}`}
                sign="up"
              />
            ))}
          </Rows>
        </Section>
      </div>
    </AppShell>
  );
}
