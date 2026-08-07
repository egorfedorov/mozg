/**
 * Put prices on the brains in a pack.
 *
 *   npm run price-pack -- --pack igaming            # dry run, prints the plan
 *   npm run price-pack -- --pack igaming --write
 *   npm run price-pack -- --pack igaming --free --write   # take them back off
 *
 * The numbers come from src/lib/packs.ts, so the pack page, the paywall and
 * this script cannot disagree about what anything costs.
 *
 * Run scripts/grandfather.ts FIRST. Pricing a brain people already read is a
 * promise broken by default — this script prints how many readers are exposed
 * and refuses to write until they hold a grant.
 */
import { query } from "../src/db";
import { PACKS, packBySlug } from "../src/lib/packs";
import { formatCents } from "../src/lib/money-math";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const packName = arg("pack") ?? "igaming";
  const pack = packBySlug(packName);
  if (!pack) {
    console.error(`unknown pack "${packName}". Known: ${PACKS.map((p) => p.slug).join(", ")}`);
    process.exit(1);
  }
  const write = process.argv.includes("--write");
  const free = process.argv.includes("--free");

  const brains = await query<{
    id: string;
    slug: string;
    price_cents: number;
    is_family: boolean;
  }>(
    `select b.id, b.slug, b.price_cents,
            exists (select 1 from brains k where k.parent_id = b.id) as is_family
       from brains b
       left join brains p on p.id = b.parent_id
      where b.visibility = 'public'
        and (b.slug = any($1) or p.slug = any($1) or b.slug = any($2))
      order by b.slug`,
    [pack.parents, pack.loose],
  );
  if (!brains.length) {
    console.error("no brains matched — check the slugs in src/lib/packs.ts");
    process.exit(1);
  }

  const priced = brains.map((b) => ({
    ...b,
    next: free ? 0 : b.is_family ? pack.familyPriceCents : pack.memberPriceCents,
  }));

  console.log(`pack ${pack.slug} — ${formatCents(pack.priceCents)} for all ${brains.length}\n`);
  for (const b of priced) {
    const change = b.price_cents === b.next ? "unchanged" : `${formatCents(b.price_cents)} → ${formatCents(b.next)}`;
    console.log(`  ${b.slug.padEnd(28)} ${b.is_family ? "family " : "brain  "} ${change}`);
  }

  // Who is reading these today without a grant to protect them. A grant is
  // what scripts/grandfather.ts writes; anyone left over would hit a paywall
  // on material they were using this morning.
  const exposed = await query<{ email: string }>(
    `select distinct u.email
       from calls c
       join "user" u on u.id = c.caller_id
      where c.brain_id = any($1::uuid[])
        and not exists (
          select 1 from grants g
           where g.brain_id = c.brain_id and lower(g.email) = lower(u.email)
        )
        and not exists (select 1 from brains b where b.id = c.brain_id and b.owner_id = u.id)`,
    [brains.map((b) => b.id)],
  );

  if (exposed.length && !free) {
    console.log(
      `\n⚠ ${exposed.length} reader(s) have called these brains and hold no grant:\n` +
        exposed.map((r) => `   ${r.email}`).join("\n") +
        `\n\n  Run:  npm run grandfather -- --pack ${pack.slug} --write`,
    );
    if (write) {
      console.error("\nrefusing to price material people are reading unprotected.");
      process.exit(1);
    }
  }

  if (!write) {
    console.log("\ndry run — nothing written. Re-run with --write.");
    return;
  }

  for (const b of priced) {
    if (b.price_cents === b.next) continue;
    await query(`update brains set price_cents = $2, updated_at = now() where id = $1`, [
      b.id,
      b.next,
    ]);
  }
  console.log(`\npriced ${priced.filter((b) => b.price_cents !== b.next).length} brain(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
