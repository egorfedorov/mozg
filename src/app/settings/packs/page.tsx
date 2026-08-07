import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ConfirmForm from "@/components/ConfirmForm";
import { Row, Rows, Section, Stat, Stats } from "@/components/ui";
import { maybeOne, query } from "@/db";
import { currentUser } from "@/lib/session";
import { limitsFor } from "@/lib/plans";
import { seatsOf, studioFor } from "@/lib/team";
import { PACKS } from "@/lib/packs";
import InviteForm from "./InviteForm";
import { removeMember } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Packs & people — mozg" };

/**
 * What this account can share, and who it is shared with.
 *
 * A seat carries two different things and the page has to say both, because
 * only one of them is obvious. The brains you own, yes — but also the packs
 * you BOUGHT, and that is the half that makes a pack sale work at all: the
 * brains in a pack belong to whoever wrote them, so a studio that buys one
 * owns nothing, and the only thing a colleague can inherit is the receipt.
 *
 * Two readers land here needing opposite things. The owner hands out and takes
 * back seats. A colleague needs to know whose seat they hold and that their
 * calls are not coming out of their own pocket — so they get that answer
 * instead of an invite form they cannot use.
 */
export default async function TeamPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/settings/packs");

  const [seats, limits, studio, held, owned] = await Promise.all([
    seatsOf(user.id),
    Promise.resolve(limitsFor(user.plan)),
    studioFor(user.id),
    // Which packs this account has bought into. A pack counts as held when any
    // of its named families or loose brains has been bought — the parent's
    // price is the bundle, so one receipt is the whole pack.
    query<{ slug: string; title: string }>(
      `select distinct b.slug, b.title
         from purchases pu
         join brains b on b.id = pu.brain_id
        where pu.buyer_id = $1`,
      [user.id],
    ),
    query<{ n: number }>(
      `select count(*)::int as n from brains where owner_id = $1`,
      [user.id],
    ).then((r) => r[0]?.n ?? 0),
  ]);

  // Name the packs rather than the individual brains: a reader who bought
  // "Stake Engine" thinks of it as the iGaming pack, not as six rows.
  const packsHeld = PACKS.filter((p) =>
    held.some((h) => p.parents.includes(h.slug) || p.loose.includes(h.slug)),
  );

  const host = studio
    ? await maybeOne<{ name: string | null; handle: string | null; email: string }>(
        `select name, handle, email from "user" where id = $1`,
        [studio.ownerId],
      )
    : null;

  const total = limits.seats;
  const taken = seats.length + 1;
  const canInvite = total > 1 && taken < total;

  return (
    <AppShell
      active="/settings/packs"
      eyebrow={total > 1 ? `${taken} of ${total} seats on ${user.plan}` : `${user.plan} plan`}
      title="Packs & people"
      narrow
    >
      <div className="stack">
        {studio && (
          <Section title="Your seat">
            <Rows>
              <Row
                title={host?.name ?? host?.handle ?? host?.email ?? "a studio"}
                sub={
                  studio.role === "contributor"
                    ? "You read every brain they own, and your agent may propose notes."
                    : "You read every brain they own."
                }
                meta={`their packs and their brains, and your agent's calls come out of their ${studio.plan} allowance rather than yours`}
              />
            </Rows>
          </Section>
        )}

        {total > 1 ? (
          <div>
            <p className="lede">
              A seat is an invitation to this account, not to a brain. It
              carries the packs you have bought and every brain you own — now
              and later, without a second invitation. Seats are matched on a
              verified email address, and only you can hand one out or take one
              back.
            </p>

            <Stats>
              <Stat label="Seats" value={`${taken} / ${total}`} big />
              <Stat
                label="Packs shared"
                value={String(packsHeld.length)}
                note={packsHeld.map((p) => p.title).join(", ") || "none bought yet"}
              />
              <Stat label="Brains of your own" value={String(owned)} />
            </Stats>

            <InviteForm disabled={!canInvite} />
            {!canInvite && (
              <p className="mono" style={{ color: "var(--ink-2)", fontSize: ".8125rem", marginTop: ".5rem" }}>
                Every seat is taken. Remove someone below, or{" "}
                <Link href="/settings#plan" style={{ textDecoration: "underline" }}>
                  take a bigger plan
                </Link>
                .
              </p>
            )}
          </div>
        ) : (
          <div>
            <p className="lede">
              Seats come with the studio plan: five people on one allowance,
              reading the packs this account has bought and the brains it owns.
              On {user.plan} it is just you.
            </p>
            <p style={{ marginTop: ".75rem" }}>
              <Link className="btn" href="/packs">
                See the packs
              </Link>{" "}
              <Link className="btn btn-ghost" href="/settings#plan">
                Upgrade
              </Link>
            </p>
          </div>
        )}

        {total > 1 && (
          <Section title="Seats given" aside={`${seats.length} of ${total - 1}`}>
            <Rows empty="Nobody yet. Invite a colleague and they get your packs and your brains.">
              {seats.map((s) => (
                <Row
                  key={s.id}
                  title={s.email}
                  sub={s.role === "contributor" ? "can propose notes" : "read only"}
                  meta={
                    s.member_id
                      ? "active"
                      : "waiting — opens when they sign in with this address and verify it"
                  }
                  side={
                    <ConfirmForm
                      action={removeMember}
                      message={`Take back ${s.email}'s seat? They lose your packs and your brains on their next call.`}
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
          </Section>
        )}
      </div>
    </AppShell>
  );
}
