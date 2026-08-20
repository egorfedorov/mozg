import { translator } from "@/lib/t";
import { fill, markup } from "@/lib/markup";
import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ConfirmForm from "@/components/ConfirmForm";
import { Row, Rows, Section } from "@/components/ui";
import { query } from "@/db";
import { currentUser } from "@/lib/session";
import { formatCents } from "@/lib/money-math";
import { PACKS } from "@/lib/packs";
import { packsFor, seatsOn } from "@/lib/pack-access";
import { brainsIn, statsOf } from "@/lib/pack-brains";
import BuyPack from "./BuyPack";
import InviteForm from "./InviteForm";
import { removePackSeat } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await translator();
  return { title: t("Packs — mozg") };
}

/**
 * The packs this account holds, and who each one is shared with.
 *
 * A pack is bought once and comes with a fixed number of seats, so this page
 * is a list of receipts rather than a subscription screen — nothing here
 * renews and nothing here expires. Two readers land on it: the buyer, who
 * hands out and takes back seats, and somebody sitting on a colleague's
 * purchase, who mostly needs to know whose it is and that it is not theirs to
 * give away.
 */
export default async function PacksSettingsPage() {
  const t = await translator();

  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/settings/packs");

  const [held, balanceRow] = await Promise.all([
    packsFor(user.id),
    query<{ balance_cents: number }>(`select balance_cents from "user" where id = $1`, [
      user.id,
    ]).then((r) => r[0]?.balance_cents ?? 0),
  ]);

  const rows = await Promise.all(
    PACKS.map(async (pack) => {
      const holding = held.find((h) => h.pack === pack.slug);
      const [brains, seats, buyer] = await Promise.all([
        brainsIn(pack),
        holding?.own ? seatsOn(pack.slug, user.id) : Promise.resolve([]),
        holding && !holding.own
          ? query<{ name: string | null; handle: string | null; email: string }>(
              `select name, handle, email from "user" where id = $1`,
              [holding.buyerId],
            ).then((r) => r[0] ?? null)
          : Promise.resolve(null),
      ]);
      return { pack, holding, seats, buyer, stats: statsOf(brains) };
    }),
  );

  const owned = rows.filter((r) => r.holding?.own).length;

  return (
    <AppShell
      active="/settings/packs"
      eyebrow={
        owned
          ? fill(owned === 1 ? t("<0/> pack bought · balance <1/>") : t("<0/> packs bought · balance <1/>"), [
              owned,
              formatCents(balanceRow),
            ])
          : fill(t("balance <0/>"), [formatCents(balanceRow)])
      }
      title={t("Packs")}
      narrow
    >
      <div className="stack">
        <p className="lede">
          {markup(t("A pack is a trade’s brains bought together, once — it does not renew and it does not expire. Each one comes with seats you hand to colleagues by email; their own plan still decides how much they can teach and how many calls they may make, so a busy colleague ends up on their own <0>pro or team</0> rather than quietly eating yours."), [
          <Link href="/settings#plan" key="s0" />,
        ])}</p>

        {rows.map(({ pack, holding, seats, buyer, stats }) => {
          const given = seats.length;
          const free = pack.seats - 1 - given;

          return (
            <Section
              key={pack.slug}
              title={pack.title}
              aside={
                holding?.own
                  ? fill(t("<0/> of <1/> seats used"), [given + 1, pack.seats])
                  : holding
                    ? "on a colleague's purchase"
                    : formatCents(pack.priceCents)
              }
            >
              <p style={{ color: "var(--ink-2)", margin: "0 0 .75rem" }}>
                {markup(t("<0/> brains · <1/> notes <2/> · <3>what is in it</3>"), [
                stats.brains,
                stats.notes.toLocaleString("en-US"),
                stats.median !== null && ` · ${stats.median}% median exam score`,
                <Link href={`/packs/${pack.slug}`} style={{ textDecoration: "underline" }} key="s3" />,
              ])}</p>

              {!holding && (
                <BuyPack
                  pack={pack.slug}
                  priceCents={pack.priceCents}
                  affordable={balanceRow >= pack.priceCents}
                />
              )}

              {holding && !holding.own && (
                <Rows>
                  <Row
                    title={buyer?.name ?? buyer?.handle ?? buyer?.email ?? "a colleague"}
                    sub={t("bought this pack and gave you a seat on it.")}
                    meta={t("your own plan still decides your calls and how much you can teach")}
                  />
                </Rows>
              )}

              {holding?.own && (
                <>
                  <InviteForm pack={pack.slug} disabled={free <= 0} />
                  {free <= 0 && (
                    <p
                      className="mono"
                      style={{ color: "var(--ink-2)", fontSize: ".8125rem", marginTop: ".5rem" }}
                    >
                      {markup(t("All <0/> seats are taken — yours and <1/> given out. Take one back to move it."), [
                      pack.seats,
                      given,
                    ])}</p>
                  )}

                  <div style={{ marginTop: "1rem" }}>
                    <Rows empty={t("Nobody yet. Give a seat and they read the whole pack.")}>
                      {seats.map((s) => (
                        <Row
                          key={s.id}
                          title={s.email}
                          meta={
                            s.member_id
                              ? "active"
                              : "waiting — opens when they sign in with this address and verify it"
                          }
                          side={
                            <ConfirmForm
                              action={removePackSeat}
                              message={fill(
                                t("Take back <0/>’s seat on <1/>? They lose the pack on their next call."),
                                [s.email, pack.title],
                              )}
                            >
                              <input type="hidden" name="id" value={s.id} />
                              <button
                                className="mono"
                                style={{
                                  background: "none",
                                  border: 0,
                                  padding: 0,
                                  color: "var(--color-riso-red)",
                                  fontSize: ".8125rem",
                                  cursor: "pointer",
                                  textDecoration: "underline",
                                }}
                              >
                                {t("remove")}</button>
                            </ConfirmForm>
                          }
                        />
                      ))}
                    </Rows>
                  </div>
                </>
              )}
            </Section>
          );
        })}
      </div>
    </AppShell>
  );
}
