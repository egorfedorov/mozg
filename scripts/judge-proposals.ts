/**
 * Read the proposal queue and take the ones a stranger could use.
 *
 *   npm run judge:proposals              # judge everything pending, dry run
 *   npm run judge:proposals -- --apply   # and approve what passes
 *
 * The owner still decides everything else. This only ever ADDS approvals: a
 * note the judge refuses stays pending with its reason printed, because the
 * answer to a project-specific note is "put it in your own brain", which is a
 * conversation and not a rejection.
 *
 * Approving goes through lib/review.ts — it embeds first and flips the status
 * second, so a note is never active-but-unsearchable.
 */
import { query } from "@/db";
import { approve } from "@/lib/review";
import { autoApprovable, judgeProposal } from "@/lib/proposal-judge";
import type { Note } from "@/db/types";

async function main() {
  const apply = process.argv.includes("--apply");

  const pending = await query<Note & { slug: string; who: string | null }>(
    `select n.*, b.slug, u.handle as who
       from notes n
       join brains b on b.id = n.brain_id
       left join "user" u on u.id = n.proposed_by
      where n.status = 'pending'
      order by b.slug, n.created_at`,
  );
  if (!pending.length) {
    console.log("\nNothing pending.\n");
    process.exit(0);
  }

  console.log(`\n${pending.length} pending${apply ? "" : " (dry run — pass --apply to take them)"}\n`);

  let taken = 0;
  let cents = 0;
  for (const note of pending) {
    const v = await judgeProposal(note);
    cents += v.costCents;
    const ok = autoApprovable(v);
    console.log(
      `${ok ? "TAKE " : "leave"}  ${note.slug}  ${note.title.slice(0, 56)}` +
        `\n        ${v.belongs} — ${v.reason}` +
        (note.who ? `\n        proposed by ${note.who}` : ""),
    );
    if (ok && apply) {
      await approve(note);
      taken++;
    }
  }

  console.log(
    `\n${apply ? `${taken} approved` : "dry run"}, ` +
      `${pending.length - (apply ? taken : 0)} left for the owner, ${cents.toFixed(2)}¢\n`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
