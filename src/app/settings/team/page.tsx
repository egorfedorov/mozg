import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ConfirmForm from "@/components/ConfirmForm";
import { Row, Rows, Section, Stat, Stats } from "@/components/ui";
import { maybeOne } from "@/db";
import { currentUser } from "@/lib/session";
import { limitsFor } from "@/lib/plans";
import { seatsOf, studioFor } from "@/lib/team";
import InviteForm from "./InviteForm";
import { removeMember } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Studio — mozg" };

/**
 * The seat list.
 *
 * Two readers land here and they need opposite things. The owner needs to hand
 * out and take back seats. A colleague needs to know whose studio they are in
 * and that their calls are not coming out of their own pocket — so the page
 * answers that instead of showing them an invite form they cannot use.
 */
export default async function TeamPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/settings/team");

  const [seats, limits, studio] = await Promise.all([
    seatsOf(user.id),
    Promise.resolve(limitsFor(user.plan)),
    studioFor(user.id),
  ]);

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
      active="/settings/team"
      eyebrow={total > 1 ? `${taken} of ${total} seats on ${user.plan}` : `${user.plan} plan`}
      title="Studio"
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
                meta={`your agent's calls come out of their ${studio.plan} allowance, not yours`}
              />
            </Rows>
          </Section>
        )}

        {total > 1 ? (
          <div>
            <p className="lede">
              A seat is an invitation to the studio, not to a brain: every brain
              you own now, and every brain you make later, without a second
              invitation. Seats are matched on a verified email address, and
              only you can hand one out or take it back.
            </p>

            <Stats>
              <Stat label="Seats" value={`${taken} / ${total}`} big />
              <Stat label="Yours" value="1" note="you hold one by owning it" />
              <Stat label="Given" value={String(seats.length)} />
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
              reading every brain the studio owns. On {user.plan} it is just
              you.
            </p>
            <p style={{ marginTop: ".75rem" }}>
              <Link className="btn" href="/studios">
                What a studio gets
              </Link>{" "}
              <Link className="btn btn-ghost" href="/settings#plan">
                Upgrade
              </Link>
            </p>
          </div>
        )}

        {total > 1 && (
          <Section title="Seats given" aside={`${seats.length} of ${total - 1}`}>
            <Rows empty="Nobody yet. Invite a colleague and they get everything you own.">
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
                      message={`Take back ${s.email}'s seat? They lose access to every brain you own on their next call.`}
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
