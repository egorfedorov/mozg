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

export const metadata = { title: "Packs — mozg" };

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
          ? `${owned} pack${owned === 1 ? "" : "s"} bought · balance ${formatCents(balanceRow)}`
          : `balance ${formatCents(balanceRow)}`
      }
      title="Packs"
      narrow
    >
      <div className="stack">
        <p className="lede">
          A pack is a trade&rsquo;s brains bought together, once — it does not
          renew and it does not expire. Each one comes with seats you hand to
          colleagues by email; their own plan still decides how much they can
          teach and how many calls they may make, so a busy colleague ends up
          on their own <Link href="/settings#plan">pro or team</Link> rather
          than quietly eating yours.
        </p>

        {rows.map(({ pack, holding, seats, buyer, stats }) => {
          const given = seats.length;
          const free = pack.seats - 1 - given;

          return (
            <Section
              key={pack.slug}
              title={pack.title}
              aside={
                holding?.own
                  ? `${given + 1} of ${pack.seats} seats used`
                  : holding
                    ? "on a colleague's purchase"
                    : formatCents(pack.priceCents)
              }
            >
              <p style={{ color: "var(--ink-2)", margin: "0 0 .75rem" }}>
                {stats.brains} brains · {stats.notes.toLocaleString("en-US")} notes
                {stats.median !== null && ` · ${stats.median}% median exam score`} ·{" "}
                <Link href={`/packs/${pack.slug}`} style={{ textDecoration: "underline" }}>
                  what is in it
                </Link>
              </p>

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
                    sub="bought this pack and gave you a seat on it."
                    meta="your own plan still decides your calls and how much you can teach"
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
                      All {pack.seats} seats are taken — yours and {given} given
                      out. Take one back to move it.
                    </p>
                  )}

                  <div style={{ marginTop: "1rem" }}>
                    <Rows empty="Nobody yet. Give a seat and they read the whole pack.">
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
                              message={`Take back ${s.email}'s seat on ${pack.title}? They lose the pack on their next call.`}
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
                                remove
                              </button>
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
