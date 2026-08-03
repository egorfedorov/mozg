/**
 * Work the review queue from the terminal.
 *
 *   npm run review -- --brain stake-engine-rgs-api          # list what is waiting
 *   npm run review -- --brain stake-engine-rgs-api --approve-all
 *   npm run review -- --approve <note-id>
 *   npm run review -- --reject <note-id>
 *
 * Approving is where a note an agent wrote becomes searchable, so this is the
 * step that closes the loop: the agent learned something, you agreed, and now
 * every agent has it.
 */
import { query, maybeOne } from "@/db";
import type { Note } from "@/db/types";
import { approve, reject } from "@/lib/review";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const approveId = arg("approve");
  const rejectId = arg("reject");

  if (rejectId) {
    await reject(rejectId);
    console.log(`\nrejected ${rejectId}\n`);
    process.exit(0);
  }

  if (approveId) {
    const note = await maybeOne<Note>(
      `select * from notes where id = $1 and status = 'pending'`,
      [approveId],
    );
    if (!note) {
      console.error(`\nNo pending note ${approveId}.\n`);
      process.exit(1);
    }
    await approve(note);
    console.log(`\napproved "${note.title}" — searchable now\n`);
    process.exit(0);
  }

  const slug = arg("brain");
  const pending = await query<Note & { slug: string }>(
    `select n.*, b.slug from notes n join brains b on b.id = n.brain_id
      where n.status = 'pending' and ($1::text is null or b.slug = $1)
      order by b.slug, n.created_at`,
    [slug ?? null],
  );

  if (!pending.length) {
    console.log(`\nnothing waiting${slug ? ` in ${slug}` : ""}\n`);
    process.exit(0);
  }

  if (process.argv.includes("--approve-all")) {
    console.log(`\napproving ${pending.length} note(s)\n`);
    for (const note of pending) {
      await approve(note);
      console.log(`  ✓ ${note.title}`);
    }
    console.log("");
    process.exit(0);
  }

  console.log(`\n${pending.length} note(s) waiting for review\n`);
  for (const n of pending) {
    console.log(`  ${n.id}  [${n.slug}] ${n.kind}`);
    console.log(`    ${n.title}`);
    console.log(`    ${n.body.replace(/\s+/g, " ").slice(0, 160)}`);
    console.log(`    written by ${n.agent_client ?? "an agent"}\n`);
  }
  console.log("  --approve <id>, --reject <id>, or --approve-all\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n" + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
