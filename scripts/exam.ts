/**
 * Make a brain sit its exam now.
 *
 *   npm run exam -- --brain stake-engine
 *   npm run exam -- --all
 *
 * The worker re-examines a brain whenever it learns something, so this is for
 * when the exam itself changed — a rewritten goal, a wider retrieval scope —
 * and the score on screen describes a system that no longer exists.
 */
import { query, maybeOne } from "@/db";
import { runExam } from "@/worker/exam";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function sit(id: string, slug: string) {
  const before = await maybeOne<{ score: number | null }>(
    `select score from brains where id = $1`,
    [id],
  );
  const result = await runExam(id, { force: true });
  if (!result) {
    console.log(`  ${slug.padEnd(26)} skipped — no goal`);
    return;
  }
  const was = before?.score;
  const delta =
    was === null || was === undefined
      ? "first run"
      : `${result.score - was >= 0 ? "+" : ""}${result.score - was}`;
  console.log(
    `  ${slug.padEnd(26)} ${String(result.score).padStart(3)}%  ` +
      `(${result.passed}/${result.total})  ${delta}  ${result.costCents.toFixed(1)}¢`,
  );
}

async function main() {
  const slug = arg("brain");
  const all = process.argv.includes("--all");

  if (!slug && !all) {
    console.error("\nPass --brain <slug>, or --all.\n");
    process.exit(1);
  }

  const brains = slug
    ? await query<{ id: string; slug: string }>(
        `select id, slug from brains where slug = $1`,
        [slug],
      )
    : await query<{ id: string; slug: string }>(
        `select id, slug from brains where goal is not null and note_count > 0
          order by parent_id nulls first, slug`,
      );

  if (!brains.length) {
    console.error(`\nNothing to examine${slug ? ` for "${slug}"` : ""}.\n`);
    process.exit(1);
  }

  console.log(`\nexamining ${brains.length} brain(s)\n`);
  // One brain's bad day must not cost the other twenty-six their sitting.
  for (const b of brains) {
    try {
      await sit(b.id, b.slug);
    } catch (err) {
      console.error(
        `  ${b.slug.padEnd(26)} FAILED: ${err instanceof Error ? err.message.slice(0, 120) : err}`,
      );
    }
  }
  console.log("");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n" + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
