import Link from "next/link";
import { query } from "@/db";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "learn — study what your AI agent knows",
  description:
    "Spaced-repetition learning built on mozg brains: the same exam-scored, always-current knowledge your coding agent queries — as cards and quiz questions for you.",
};

/**
 * The learn service's front door. Deliberately its own brand surface — green
 * dot, own header, no product chrome — because this is a different promise
 * to a different reader: not "your agent gets a brain" but "you learn what
 * your agent knows".
 */
export default async function LearnHome() {
  const user = await currentUser();

  // Brains this person can study: their library and free public ones. For a
  // visitor, the free shelf is the pitch.
  const brains = await query<{
    handle: string;
    slug: string;
    title: string;
    goal: string | null;
    score: number | null;
    cards: number;
    due: number;
    seen: number;
  }>(
    user
      ? `with mine as (
           select b.id, u.handle, b.slug, b.title, b.goal, b.score from brains b
             join "user" u on u.id = b.owner_id
            where b.owner_id = $1
           union
           select b.id, u.handle, b.slug, b.title, b.goal, b.score from library l
             join brains b on b.id = l.brain_id join "user" u on u.id = b.owner_id
            where l.user_id = $1
         )
         select m.handle, m.slug, m.title, m.goal, m.score,
                (select count(*) from notes n where n.brain_id = m.id and n.status = 'active')::int
                + (select count(*) from checks c where c.brain_id = m.id and c.enabled)::int as cards,
                (select count(*) from learn_progress p
                  where p.user_id = $1 and p.brain_id = m.id and p.due_at <= now())::int as due,
                (select count(*) from learn_progress p
                  where p.user_id = $1 and p.brain_id = m.id)::int as seen
           from mine m order by due desc, cards desc limit 40`
      : `select u.handle, b.slug, b.title, b.goal, b.score,
                (select count(*) from notes n where n.brain_id = b.id and n.status = 'active')::int
                + (select count(*) from checks c where c.brain_id = b.id and c.enabled)::int as cards,
                0 as due, 0 as seen
           from brains b join "user" u on u.id = b.owner_id
          where b.visibility = 'public' and b.price_cents = 0 and u.handle is not null
            and b.note_count > 0
          order by b.score desc nulls last limit 24`,
    user ? [user.id] : [],
  );

  // The free shelf shows for everyone — a signed-in person with an empty
  // library is exactly the visitor who needs somewhere to start.
  const free = await query<(typeof brains)[number]>(
    `select u.handle, b.slug, b.title, b.goal, b.score,
            (select count(*) from notes n where n.brain_id = b.id and n.status = 'active')::int
            + (select count(*) from checks c where c.brain_id = b.id and c.enabled)::int as cards,
            0 as due, 0 as seen
       from brains b join "user" u on u.id = b.owner_id
      where b.visibility = 'public' and b.price_cents = 0 and u.handle is not null
        and b.note_count > 0
        and not (u.handle || '/' || b.slug = any($1::text[]))
      order by b.score desc nulls last limit 24`,
    [brains.map((b) => `${b.handle}/${b.slug}`)],
  );

  return (
    <>
      <header style={{ borderBottom: "1.5px solid var(--ink)", background: "var(--paper)" }}>
        <div className="shell" style={{ display: "flex", alignItems: "baseline", gap: "1rem", paddingBlock: ".9rem" }}>
          <span style={{ fontWeight: 800, fontSize: "1.25rem", letterSpacing: "-0.02em" }}>
            learn<span style={{ color: "var(--color-riso-green)" }}>.</span>
          </span>
          <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>
            a mozg service
          </span>
          <Link className="mono" href="/" style={{ marginLeft: "auto", fontSize: ".8125rem" }}>
            mozg.sh →
          </Link>
        </div>
      </header>

      <main className="shell" style={{ paddingBlock: "clamp(2.5rem, 7vw, 4.5rem)" }}>
        <p className="eyebrow">For humans</p>
        <h1 className="display" style={{ fontSize: "clamp(2rem, 6.5vw, 4rem)", margin: ".5rem 0 1rem" }}>
          Study what your
          <br />
          AI agent knows.
        </h1>
        <p className="lede" style={{ maxWidth: "58ch" }}>
          Every mozg brain is exam-scored knowledge kept current by re-reads.
          Your agent queries it over MCP — and you can learn the very same
          material: notes become cards, the exam becomes your quiz, and spaced
          repetition brings each card back right before you would forget it.
          The brain shows its score; see if you can beat your own agent.
        </p>

        {!user && (
          <p style={{ marginTop: "1rem" }}>
            <Link className="btn" href="/sign-in?next=/learn">Sign in to keep progress</Link>
          </p>
        )}

        <h2 className="h2" style={{ margin: "2.5rem 0 1rem" }}>
          {user ? "Your shelf" : "Free brains to start with"}
        </h2>

        <div className="grid-brains">
          {brains.map((b) => (
            <Link
              key={`${b.handle}/${b.slug}`}
              href={`/learn/${b.handle}/${b.slug}`}
              style={{ border: "1.5px solid var(--ink)", background: "var(--paper-2)", padding: "1.1rem", display: "block" }}
            >
              <h3 className="h3" style={{ margin: "0 0 .35rem" }}>{b.title}</h3>
              {b.goal && (
                <p style={{ color: "var(--ink-2)", fontSize: ".875rem", margin: "0 0 .6rem" }}>
                  {b.goal.split("\n")[0].slice(0, 120)}
                </p>
              )}
              <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", margin: 0 }}>
                {b.cards} cards
                {b.score != null ? ` · agent ${b.score}%` : ""}
                {b.due > 0 && (
                  <span style={{ color: "var(--color-riso-red)" }}> · {b.due} due</span>
                )}
                {b.seen > 0 && ` · ${b.seen} seen`}
              </p>
            </Link>
          ))}
        </div>

        {user && brains.length === 0 && (
          <p style={{ color: "var(--ink-2)" }}>
            Your shelf is empty — start with a free brain below, or add one
            from the{" "}
            <Link href="/explore" style={{ textDecoration: "underline" }}>catalogue</Link>{" "}
            and it appears here as a course.
          </p>
        )}

        {free.length > 0 && (
          <>
            <h2 className="h2" style={{ margin: "2.5rem 0 1rem" }}>
              {user ? "Free brains to add" : "More free brains"}
            </h2>
            <div className="grid-brains">
              {free.map((b) => (
                <Link
                  key={`${b.handle}/${b.slug}`}
                  href={`/learn/${b.handle}/${b.slug}`}
                  style={{ border: "1.5px solid var(--ink)", background: "var(--paper-2)", padding: "1.1rem", display: "block" }}
                >
                  <h3 className="h3" style={{ margin: "0 0 .35rem" }}>{b.title}</h3>
                  {b.goal && (
                    <p style={{ color: "var(--ink-2)", fontSize: ".875rem", margin: "0 0 .6rem" }}>
                      {b.goal.split("\n")[0].slice(0, 120)}
                    </p>
                  )}
                  <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", margin: 0 }}>
                    {b.cards} cards
                    {b.score != null ? ` · agent ${b.score}%` : ""}
                  </p>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
