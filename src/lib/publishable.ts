import { one } from "@/db";

/**
 * The one door onto the catalogue.
 *
 * Publishing used to require nothing: no material, no measured score. Twelve
 * of the seventy-five public brains had zero notes — a visitor could open one,
 * find an empty shelf, and conclude the whole product was empty. The score on
 * a card is the only factual claim this catalogue makes, and a card with no
 * score behind it is worse than no card.
 *
 * Counted family-wide on purpose: an umbrella brain legitimately holds nothing
 * itself while its children hold thousands of notes, and ai-sdk, react, nuxt
 * and svelte are all shaped that way. Their exam runs over the family too, so
 * both halves of this check agree with how the brain is actually read.
 */
export async function publishBlocker(brainId: string): Promise<string | null> {
  const row = await one<{ notes: number; scored: boolean }>(
    `select
       (select count(*)::int from notes n
         where n.status = 'active'
           and (n.brain_id = $1
                or n.brain_id in (select id from brains c where c.parent_id = $1))) as notes,
       exists (select 1 from check_runs r
                where r.brain_id = $1 and r.status = 'done' and r.score is not null) as scored`,
    [brainId],
  );

  if (!row.notes) {
    return (
      "This brain has no notes yet, so there would be nothing to read. " +
      "Add material — a URL, a repository, a file — and publish once it has landed."
    );
  }
  if (!row.scored) {
    return (
      "This brain has not sat its exam yet, so the catalogue has no score to " +
      "show for it. The exam runs by itself after material is read; publish " +
      "once the first result is in."
    );
  }
  return null;
}
