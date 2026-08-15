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
import { writeFileSync } from "node:fs";
import { one } from "@/db";
import { startPack } from "@/lib/assetpacks";
import { exportPack } from "@/lib/packexport";
import { SETS } from "@/lib/slotgen";
import { enqueueGeneration } from "@/worker/queue";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("owner");

  // Second verb: build the same archive a studio downloads, without a browser
  // session. This is how an export gets checked after a deploy — on real bytes
  // out of real storage, which is the half no unit test covers.
  const zipId = arg("zip");
  if (zipId) {
    if (!email) {
      console.error("\nPass --owner <email> with --zip <pack id>.\n");
      process.exit(1);
    }
    const owner = await one<{ id: string }>(
      `select id from "user" where lower(email) = lower($1)`,
      [email],
    );
    const built = await exportPack(zipId, owner.id);
    if (!built) {
      console.error("\n✗ no such pack, or nothing finished in it yet\n");
      process.exit(1);
    }
    const out = arg("out") ?? `/tmp/${built.filename}`;
    writeFileSync(out, built.bytes);
    console.log(`\n✓ ${out} — ${(built.bytes.length / 1024 / 1024).toFixed(1)} MB`);
    for (const name of built.contents) console.log(`  ${name}`);
    console.log("");
    process.exit(0);
  }

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
