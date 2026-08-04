import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { query } from "@/db";
import { accessForSlug } from "@/lib/access";
import { currentUser } from "@/lib/session";
import Session, { type Card } from "../Session";

export const dynamic = "force-dynamic";

const SESSION_SIZE = 20;

/**
 * One sitting of cards. Due reviews first — the schedule knows best — then
 * new material. With ?category= the sitting stays inside one module, which
 * is what "quiz me on this lesson" means.
 */
export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string; slug: string }>;
  searchParams: Promise<{ category?: string }>;
}) {
  const { handle, slug } = await params;
  const { category = null } = await searchParams;
  const user = await currentUser();
  if (!user) redirect(`/sign-in?next=/learn/${handle}/${slug}`);

  const found = await accessForSlug(handle, slug, user.id);
  if (!found?.brain || !found.access) notFound();
  const brain = found.brain;

  const due = await query<Card & { kind: "note" | "check" }>(
    `select p.kind, p.item_id as id,
            coalesce(n.title, c.question) as front,
            coalesce(n.body, c.expect) as back,
            coalesce(n.category, c.category) as category,
            false as "isNew"
       from learn_progress p
       left join notes n on p.kind = 'note' and n.id = p.item_id and n.status = 'active'
       left join checks c on p.kind = 'check' and c.id = p.item_id and c.enabled
      where p.user_id = $1 and p.brain_id = $2 and p.due_at <= now()
        and coalesce(n.id, c.id) is not null
        and ($3::text is null or coalesce(coalesce(n.category, c.category), 'general') = $3)
      order by p.due_at
      limit $4`,
    [user.id, brain.id, category, SESSION_SIZE],
  );

  const room = SESSION_SIZE - due.length;
  const newNotes = room > 0
    ? await query<Card>(
        `select 'note' as kind, n.id, n.title as front, n.body as back,
                n.category, true as "isNew"
           from notes n
          where n.brain_id = $1 and n.status = 'active'
            and ($3::text is null or coalesce(n.category, 'general') = $3)
            and not exists (select 1 from learn_progress p
                             where p.user_id = $2 and p.kind = 'note' and p.item_id = n.id)
          order by n.category nulls last, n.created_at
          limit $4`,
        [brain.id, user.id, category, room],
      )
    : [];

  const room2 = room - newNotes.length;
  const newChecks = room2 > 0
    ? await query<Card>(
        `select 'check' as kind, c.id, c.question as front, c.expect as back,
                c.category, true as "isNew"
           from checks c
          where c.brain_id = $1 and c.enabled
            and ($3::text is null or coalesce(c.category, 'general') = $3)
            and not exists (select 1 from learn_progress p
                             where p.user_id = $2 and p.kind = 'check' and p.item_id = c.id)
          order by c.weight desc
          limit $4`,
        [brain.id, user.id, category, room2],
      )
    : [];

  const cards = [...due, ...newNotes, ...newChecks];
  const backHref = `/learn/${handle}/${slug}`;

  return (
    <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)", maxWidth: 820 }}>
      <p className="eyebrow">
        <Link href="/learn">learn</Link> /{" "}
        <Link href={backHref}>{brain.title}</Link> / {category ?? "review"}
        {brain.score != null && (
          <span className="mono" style={{ marginLeft: ".75rem", color: "var(--ink-3)" }}>
            the agent scores {brain.score}% — beat it
          </span>
        )}
      </p>

      {cards.length === 0 ? (
        <div style={{ border: "1.5px solid var(--ink)", background: "var(--paper-2)", padding: "2rem" }}>
          <p className="h2" style={{ margin: 0 }}>Nothing due here.</p>
          <p style={{ color: "var(--ink-2)", marginBottom: 0 }}>
            Every card in this module is scheduled for later — that is the
            system working. <Link href={backHref} style={{ textDecoration: "underline" }}>Back to the course.</Link>
          </p>
        </div>
      ) : (
        <Session brainId={brain.id} cards={cards} backHref={backHref} />
      )}
    </main>
  );
}
