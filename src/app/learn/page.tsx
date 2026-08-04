import Link from "next/link";
import { query } from "@/db";
import { currentUser } from "@/lib/session";
import LearnShell from "./LearnShell";
import { tintFor } from "@/lib/brains";
import { topicLabel } from "@/lib/topics";

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
    id: string;
    color: string;
    topic: string | null;
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
           select b.id, b.color, b.topic, u.handle, b.slug, b.title, b.goal, b.score from brains b
             join "user" u on u.id = b.owner_id
            where b.owner_id = $1
           union
           select b.id, b.color, b.topic, u.handle, b.slug, b.title, b.goal, b.score from library l
             join brains b on b.id = l.brain_id join "user" u on u.id = b.owner_id
            where l.user_id = $1
           union
           select b.id, b.color, b.topic, u.handle, b.slug, b.title, b.goal, b.score from purchases pu
             join brains b on b.id = pu.brain_id join "user" u on u.id = b.owner_id
            where pu.buyer_id = $1
           union
           -- A bundle purchase is a course bundle too: the parent's children
           -- belong on the buyer's shelf.
           select b.id, b.color, b.topic, u.handle, b.slug, b.title, b.goal, b.score from purchases pu
             join brains b on b.parent_id = pu.brain_id join "user" u on u.id = b.owner_id
            where pu.buyer_id = $1
         )
         select m.id, m.color, m.topic, m.handle, m.slug, m.title, m.goal, m.score,
                (select count(*) from notes n where n.brain_id = m.id and n.status = 'active')::int
                + (select count(*) from checks c where c.brain_id = m.id and c.enabled)::int as cards,
                (select count(*) from learn_progress p
                  where p.user_id = $1 and p.brain_id = m.id and p.due_at <= now())::int as due,
                (select count(*) from learn_progress p
                  where p.user_id = $1 and p.brain_id = m.id)::int as seen
           from mine m order by due desc, cards desc limit 40`
      : `select b.id, b.color, b.topic, u.handle, b.slug, b.title, b.goal, b.score,
                (select count(*) from notes n where n.brain_id = b.id and n.status = 'active')::int
                + (select count(*) from checks c where c.brain_id = b.id and c.enabled)::int as cards,
                0 as due, 0 as seen
           from brains b join "user" u on u.id = b.owner_id
          where b.visibility = 'public' and b.price_cents = 0 and u.handle is not null
            and b.note_count > 0
          order by b.topic, b.score desc nulls last limit 24`,
    user ? [user.id] : [],
  );

  // The free shelf shows for everyone — a signed-in person with an empty
  // library is exactly the visitor who needs somewhere to start.
  const free = await query<(typeof brains)[number]>(
    `select b.id, b.color, b.topic, u.handle, b.slug, b.title, b.goal, b.score,
            (select count(*) from notes n where n.brain_id = b.id and n.status = 'active')::int
            + (select count(*) from checks c where c.brain_id = b.id and c.enabled)::int as cards,
            0 as due, 0 as seen
       from brains b join "user" u on u.id = b.owner_id
      where b.visibility = 'public' and b.price_cents = 0 and u.handle is not null
        and b.note_count > 0
        and not (u.handle || '/' || b.slug = any($1::text[]))
      order by b.topic, b.score desc nulls last limit 24`,
    [brains.map((b) => `${b.handle}/${b.slug}`)],
  );

  return (
    <LearnShell>

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
              className="card"
              data-tint={tintFor(b)}
            >
              <span className="eyebrow" style={{ color: "inherit", opacity: 0.75 }}>
                {topicLabel(b.topic)} · course
              </span>
              <h3 className="card-title">{b.title}</h3>
              <p className="card-goal">{b.goal?.split("\n")[0] ?? "No goal set."}</p>
              <p className="mono" style={{ fontSize: ".75rem", marginTop: "auto", marginBottom: 0, opacity: 0.9 }}>
                {b.cards} cards
                {b.score != null ? ` · agent ${b.score}%` : ""}
                {b.due > 0 ? ` · ${b.due} due` : ""}
                {b.seen > 0 ? ` · ${b.seen} seen` : ""}
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
            {[...new Map(free.map((b) => [topicLabel(b.topic), true])).keys()].map((label) => (
              <section key={label} style={{ marginBottom: "1.75rem" }}>
                <p className="eyebrow" style={{ margin: "0 0 .6rem" }}>{label}</p>
            <div className="grid-brains">
              {free.filter((b) => topicLabel(b.topic) === label).map((b) => (
                <Link
                  key={`${b.handle}/${b.slug}`}
                  href={`/learn/${b.handle}/${b.slug}`}
                  className="card"
                  data-tint={tintFor(b)}
                >
                  <span className="eyebrow" style={{ color: "inherit", opacity: 0.75 }}>
                    free {topicLabel(b.topic)} · course
                  </span>
                  <h3 className="card-title">{b.title}</h3>
                  <p className="card-goal">{b.goal?.split("\n")[0] ?? "No goal set."}</p>
                  <p className="mono" style={{ fontSize: ".75rem", marginTop: "auto", marginBottom: 0, opacity: 0.9 }}>
                    {b.cards} cards
                    {b.score != null ? ` · agent ${b.score}%` : ""}
                  </p>
                </Link>
              ))}
            </div>
              </section>
            ))}
          </>
        )}
      </main>
    </LearnShell>
  );
}
