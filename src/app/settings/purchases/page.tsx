import { translator } from "@/lib/t";
import { fill, markup } from "@/lib/markup";
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
  const t = await translator();

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
    <AppShell active="/settings/purchases" eyebrow={user.email} title={t("Your brain library")}>
      <div className="stack">
        <Section
          title={t("Added from the catalogue")}
          aside={library.length ? fill(t("<0/> in your set"), [library.length]) : undefined}
        >
          <p className="lede" style={{ marginBottom: ".75rem" }}>
            {t("These appear in the list your agents read. Nothing was copied to your machine — each stays with its author and keeps improving as they add to it.")}</p>
          <Rows
            empty={
              markup(
                t(
                  "Nothing added yet. <0>Browse the catalogue</0> and add a brain; your agents see it immediately.",
                ),
                [<Link href="/explore" style={{ textDecoration: "underline" }} key="s0" />],
              )
            }
          >
            {library.map((b) => (
              <Row
                key={b.id}
                href={`/b/${b.owner_handle}/${b.slug}`}
                title={b.title}
                sub={b.still_public ? undefined : "the author unpublished it — your agents can no longer read it"}
                meta={fill(t("<0/> · <1/> notes · <2/> · added <3/>"), [
                  b.handle,
                  b.note_count,
                  b.score === null ? t("not examined") : fill(t("trained <0/>%"), [b.score]),
                  b.added_at,
                ])}
                side={
                  <form action={dropBrain}>
                    <input type="hidden" name="brainId" value={b.id} />
                    <button className="linkish">{t("remove")}</button>
                  </form>
                }
              />
            ))}
          </Rows>
        </Section>

        <Section
          title={t("Brains you bought")}
          aside={
            bought.length > 0
              ? fill(t("<0/> in total"), [formatCents(bought.reduce((n, b) => n + b.price_cents, 0))])
              : undefined
          }
        >
          <Rows
            empty={
              markup(
                t(
                  "Nothing yet. A bought brain connects to your agent exactly like your own — one token reaches everything you can read. <0>See what is on sale</0>.",
                ),
                [<Link href="/explore?price=paid" style={{ textDecoration: "underline" }} key="s0" />],
              )
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
                meta={
                  fill(t("<0/> · <1/> · <2/> notes · bought <3/>"), [
                    topicLabel(b.topic),
                    b.owner_handle ?? "—",
                    b.note_count,
                    b.bought_at,
                  ]) + (b.visibility !== "public" ? t(" · author unpublished it") : "")
                }
                side={formatCents(b.price_cents)}
              />
            ))}
          </Rows>
        </Section>

        <Section
          title={t("Brains you sold")}
          aside={
            sold.length > 0
              ? fill(t("<0/> earned"), [formatCents(sold.reduce((n, s) => n + s.earned, 0))])
              : undefined
          }
        >
          <Rows empty={t("No sales yet. A brain has to be public and priced before anyone can buy it — the price field is on its sharing page, next to the licence.")}>
            {sold.map((s) => (
              <Row
                key={s.brain_id}
                href={`/brains/${s.slug}`}
                title={s.title}
                meta={fill(s.sales === 1 ? t("<0/> sale · last <1/>") : t("<0/> sales · last <1/>"), [
                  s.sales,
                  s.last_sale,
                ])}
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
