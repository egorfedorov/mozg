/**
 * Triage the proposals readers left on a brain, from the command line.
 *
 *   npm run review                      # list everything pending
 *   npm run review -- --approve <id>    # take one
 *   npm run review -- --reject <id>     # refuse one
 *   npm run review -- --reject-empty    # refuse every note whose body is its title
 *
 * The owner does this from /brains/<slug> one click at a time, which is the
 * right shape for two proposals and the wrong one for sixteen. It exists as a
 * script because approving CANNOT be done in SQL: lib/review.ts embeds the
 * note and only then flips its status, and an "active" note with no chunks is
 * invisible to search — an approval that silently did nothing.
 */
import { maybeOne, query } from "@/db";
import { approve, reject } from "@/lib/review";
import type { Note } from "@/db/types";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function list() {
  const rows = await query<{
    id: string;
    slug: string;
    title: string;
    body_len: number;
    empty: boolean;
  }>(
    `select n.id::text, b.slug, n.title, length(trim(n.body))::int as body_len,
            (trim(n.body) = trim(n.title)) as empty
       from notes n join brains b on b.id = n.brain_id
      where n.status = 'pending'
      order by b.slug, n.created_at`,
  );
  if (!rows.length) {
    console.log("\nNothing pending.\n");
    return;
  }
  console.log(`\n${rows.length} pending:\n`);
  for (const r of rows) {
    console.log(`  ${r.id}  ${r.empty ? "EMPTY " : "      "}${r.body_len
      .toString()
      .padStart(5)}c  ${r.slug}  ${r.title.slice(0, 70)}`);
  }
  console.log("");
}

async function main() {
  const approveId = arg("approve");
  const rejectId = arg("reject");

  if (approveId) {
    const note = await maybeOne<Note>(
      `select * from notes where id = $1 and status = 'pending'`,
      [approveId],
    );
    if (!note) {
      console.error(`No pending note ${approveId}.`);
      process.exit(1);
    }
    // Embeds first; a throw here leaves the note pending, which is the
    // correct outcome when the embedder is down.
    await approve(note);
    console.log(`approved: ${note.title}`);
  } else if (rejectId) {
    await reject(rejectId);
    console.log(`rejected ${rejectId}`);
  } else if (process.argv.includes("--reject-empty")) {
    // A note whose body repeats its title carries nothing; the product's own
    // write path refuses it on the way in, and these predate that check.
    const gone = await query<{ id: string }>(
      `update notes set status = 'rejected'
        where status = 'pending' and trim(body) = trim(title)
        returning id`,
    );
    console.log(`rejected ${gone.length} empty proposal(s)`);
  }

  await list();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
