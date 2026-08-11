/**
 * Run the cross-brain contradiction pass now, and print what is open.
 *
 *   npm run contradict            # judge new candidate pairs, then list
 *   npm run contradict -- --list  # list only, spend nothing
 *
 * The pass is nightly (worker/index.ts). This exists for the two moments a
 * schedule is no use: after seeding a pack, and while tuning the distance band
 * — where you want to see the verdicts before deciding they are right.
 */
import { PACKS } from "@/lib/packs";
import { brainsIn } from "@/lib/pack-brains";
import { contradictionsIn } from "@/lib/contradictions";
import { runContradictions } from "@/worker/contradict";

async function main() {
  if (!process.argv.includes("--list")) {
    const started = Date.now();
    const r = await runContradictions();
    console.log(
      `packs=${r.packs} candidates=${r.candidates} judged=${r.judged} ` +
        `found=${r.found} retracted=${r.retracted} ` +
        `${r.costCents.toFixed(1)}¢ ${Date.now() - started}ms\n`,
    );
  }

  for (const pack of PACKS) {
    const brains = await brainsIn(pack);
    const open = await contradictionsIn(
      brains.map((b) => b.id),
      100,
    );
    console.log(`${pack.slug}: ${brains.length} brains, ${open.length} open`);
    for (const c of open) {
      console.log(`  ${c.subject}`);
      console.log(`    ${c.a.brain_slug}: ${c.a.claim}`);
      console.log(`    ${c.b.brain_slug}: ${c.b.claim}`);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
