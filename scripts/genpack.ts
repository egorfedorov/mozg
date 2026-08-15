/**
 * Order an asset pack from the command line.
 *
 *   npm run genpack -- --owner studio@mozg.sh --title "Tomb of the Scarab" \
 *     --brief "an egyptian tomb at torchlight..." --palette "gold #E8B04B" --set symbols
 *
 * The web form is the product; this is the operator's door to the same
 * function, for two jobs the form cannot do: proving the whole pipeline works
 * end to end after a deploy, and seeding the example packs the storefront
 * shows. It goes through startPack like anyone else — same debit, same
 * anchor-first queueing — because a seeding path that skips the money is a
 * path where the money is never tested.
 */
import { one } from "@/db";
import { startPack } from "@/lib/assetpacks";
import { SETS } from "@/lib/slotgen";
import { enqueueGeneration } from "@/worker/queue";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("owner");
  const title = arg("title") ?? "Untitled pack";
  const brief = arg("brief");
  const set = arg("set") ?? "full";

  if (!email || !brief) {
    console.error("\nPass --owner <email> and --brief <text>. Optional: --title, --palette, --set full|symbols|scene\n");
    process.exit(1);
  }
  if (!SETS[set]) {
    console.error(`\nUnknown set "${set}" — one of: ${Object.keys(SETS).join(", ")}\n`);
    process.exit(1);
  }

  const user = await one<{ id: string; balance_cents: number }>(
    `select id, balance_cents from "user" where lower(email) = lower($1)`,
    [email],
  );

  const specs = SETS[set]();
  const started = await startPack({
    ownerId: user.id,
    title,
    brief,
    palette: arg("palette") ?? null,
    specs,
  });

  if (!started.ok) {
    console.error(`\n✗ ${started.reason}\n`);
    process.exit(1);
  }

  await enqueueGeneration(started.anchorId);
  console.log(`\n✓ pack ${started.id} — ${specs.length} assets, anchor queued`);
  console.log(`  the rest are released when the anchor lands`);
  console.log(`  https://gen.mozg.sh/${started.id}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
