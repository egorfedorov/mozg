/**
 * Ask a brain a question from the terminal.
 *
 *   npm run ask -- stake-engine "what is the base URL for the wallet endpoints"
 *
 * Goes through the same retrieval an agent gets over MCP, including the family
 * scope — asking a parent reaches its children. Useful for judging whether a
 * brain is actually worth connecting before you connect it.
 */
import { maybeOne } from "@/db";
import type { Brain } from "@/db/types";
import { familyIds } from "@/lib/families";
import { searchBrain } from "@/lib/search";

async function main() {
  const [handle, ...rest] = process.argv.slice(2);
  const question = rest.join(" ").trim();

  if (!handle || !question) {
    console.error('\nUsage: npm run ask -- <brain-handle> "your question"\n');
    process.exit(1);
  }

  const brain = await maybeOne<Brain>(`select * from brains where slug = $1`, [handle]);
  if (!brain) {
    console.error(`\nNo brain "${handle}".\n`);
    process.exit(1);
  }

  const scope = await familyIds(brain);
  const { hits, degraded } = await searchBrain(scope, question, { limit: 5 });

  console.log(
    `\n${brain.title}${scope.length > 1 ? ` (+${scope.length - 1} children)` : ""}` +
      `${degraded ? "  [keyword only — embeddings are down]" : ""}\n`,
  );
  console.log(`? ${question}\n`);

  if (!hits.length) {
    console.log("  nothing — this brain has no material on that.\n");
    process.exit(0);
  }

  for (const [i, h] of hits.entries()) {
    console.log(
      `[${i + 1}] ${h.title}` +
        (scope.length > 1 ? `  · ${h.brain_slug}` : "") +
        (h.category ? `  (${h.category})` : ""),
    );
    console.log(`    ${h.excerpt.replace(/\s+/g, " ").slice(0, 240)}\n`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("\n" + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
