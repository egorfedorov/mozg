/**
 * Compile lessons (the editor pass) for a brain's modules, now, from the CLI.
 *
 *   npm run lesson -- --brain prompt-engineering            # every module
 *   npm run lesson -- --brain prompt-engineering --category "core techniques"
 *
 * The study page enqueues compiles lazily on first visit; this exists so a
 * course can be prepared before anyone sits it.
 */
import { one, query } from "@/db";
import { compileLesson } from "@/worker/lesson";

async function main() {
  const args = process.argv.slice(2);
  const val = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const slug = val("--brain");
  if (!slug) {
    console.error("usage: npm run lesson -- --brain <slug> [--category <name>]");
    process.exit(1);
  }

  const brain = await one<{ id: string; title: string }>(
    `select id, title from brains where slug = $1`,
    [slug],
  );

  const categories = val("--category")
    ? [val("--category")!]
    : (
        await query<{ cat: string }>(
          `select distinct coalesce(category, 'general') as cat
             from notes where brain_id = $1 and status = 'active' order by 1`,
          [brain.id],
        )
      ).map((r) => r.cat);

  console.log(`${brain.title}: ${categories.length} module(s)`);
  for (const cat of categories) {
    const started = Date.now();
    try {
      const outcome = await compileLesson(brain.id, cat);
      console.log(`  ${cat}  ${outcome}  ${Date.now() - started}ms`);
    } catch (err) {
      console.error(`  ${cat}  FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
