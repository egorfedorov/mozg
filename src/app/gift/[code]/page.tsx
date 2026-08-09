import Link from "next/link";
import { markup } from "@/lib/markup";
import { translator } from "@/lib/t";
import { redirect } from "next/navigation";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import { maybeOne, query, tx } from "@/db";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "A brain, gifted — mozg" };

/**
 * Redeeming a gift link. The redeem writes ordinary viewer grants — for the
 * brain and, when it is a family parent, for its children, because a gifted
 * parent that cannot search its family would be a gift-wrapped empty box.
 * Grants key on email, so everything downstream already honours them.
 */
export default async function GiftPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const t = await translator();

  const { code } = await params;
  const user = await currentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/gift/${code}`)}`);

  const gift = await maybeOne<{
    id: string;
    brain_id: string;
    uses_left: number;
    title: string;
    slug: string;
    owner_id: string;
    handle: string | null;
  }>(
    `select g.id, g.brain_id, g.uses_left, b.title, b.slug, b.owner_id, u.handle
       from gift_links g
       join brains b on b.id = g.brain_id
       join "user" u on u.id = b.owner_id
      where g.code = $1`,
    [code],
  );

  const already = gift
    ? await maybeOne(
        `select 1 from grants where brain_id = $1 and lower(email) = lower($2)`,
        [gift.brain_id, user.email],
      )
    : null;

  let state: "ok" | "spent" | "invalid" | "already" | "own" = "invalid";

  if (gift && gift.owner_id === user.id) {
    state = "own";
  } else if (already) {
    state = "already";
  } else if (gift && gift.uses_left > 0) {
    // Decrement and grant in one transaction, with the decrement guarded —
    // two people redeeming the last use at once must not both get in free.
    const granted = await tx(async (client) => {
      const { rowCount } = await client.query(
        `update gift_links set uses_left = uses_left - 1
          where id = $1 and uses_left > 0`,
        [gift.id],
      );
      if (!rowCount) return false;

      const family = await client.query<{ id: string }>(
        `select id from brains where id = $1
          union select id from brains where parent_id = $1`,
        [gift.brain_id],
      );
      for (const b of family.rows) {
        await client.query(
          `insert into grants (brain_id, email, role, invited_by, accepted_by)
           values ($1, $2, 'viewer', $3, $4)
           on conflict (brain_id, email) do nothing`,
          [b.id, user.email, gift.owner_id, user.id],
        );
      }
      return true;
    });
    state = granted ? "ok" : "spent";
  } else if (gift) {
    state = "spent";
  }

  // The library row makes it show up in brain_list without hunting.
  if (state === "ok" && gift) {
    await query(
      `insert into library (user_id, brain_id) values ($1, $2)
       on conflict do nothing`,
      [user.id, gift.brain_id],
    );
  }

  const brainHref = gift?.handle ? `/b/${gift.handle}/${gift.slug}` : "/explore";

  return (
    <>
      <TopBar />
      <main className="shell" style={{ paddingBlock: "clamp(3rem, 9vw, 6rem)", maxWidth: 720 }}>
        {state === "ok" || state === "already" ? (
          <>
            <p className="eyebrow">{state === "ok" ? t("Yours now") : t("Already yours")}</p>
            <h1 className="h1" style={{ margin: ".5rem 0 1rem" }}>
              {gift!.title}
            </h1>
            <p className="lede">
              {markup(t("<0/> It shows up in <1>brain_list</1> automatically."), [
              state === "ok"
                ? t("The author gifted you read access — your agents can search it the moment your address is verified.")
                : t("This gift was already redeemed on your account — nothing to do."),
              <code className="mono" key="s1" />,
            ])}</p>
            <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
              <Link className="btn" href={brainHref}>
                {t("Open the brain")}</Link>
              <Link className="btn btn-ghost" href="/connect">
                {t("Connect an agent")}</Link>
            </div>
          </>
        ) : state === "own" ? (
          <>
            <p className="eyebrow">{t("This one is yours")}</p>
            <h1 className="h1" style={{ margin: ".5rem 0 1rem" }}>
              {t("You made this gift link.")}</h1>
            <p className="lede">{t("Send it to someone else — redeeming your own brain does nothing.")}</p>
          </>
        ) : (
          <>
            <p className="eyebrow">{state === "spent" ? t("All used up") : t("Not a gift")}</p>
            <h1 className="h1" style={{ margin: ".5rem 0 1rem" }}>
              {state === "spent"
                ? t("This link's uses are spent.")
                : t("This link doesn't point at anything.")}
            </h1>
            <p className="lede">
              {markup(t("Ask the person who sent it for a fresh one, or browse the <0>catalogue</0> ."), [
              <Link href="/explore" style={{ textDecoration: "underline" }} key="s0" />,
            ])}</p>
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
