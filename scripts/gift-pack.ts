/**
 * Give a pack to everyone who was already here.
 *
 *   npm run gift-pack -- --pack igaming --before 2026-08-07     # dry run
 *   npm run gift-pack -- --pack igaming --before 2026-08-07 --write
 *
 * A real pack_purchases row at zero, not a grant. The difference matters to
 * the person receiving it: a purchase shows on /settings/packs as a pack they
 * hold, with the seats it comes with, which they can hand to colleagues. A
 * grant is invisible plumbing that opens brains one by one and gives them
 * nothing to pass on.
 *
 * It is also the honest record. `purchases` — the per-brain marketplace —
 * refuses a zero row on purpose, because there a zero would mean an author was
 * paid nothing. A pack has no author to pay: it is the platform's own
 * catalogue, so zero is a price the table was built to accept.
 *
 * The cutoff is a date rather than "everyone", so running it again next month
 * does not quietly hand the pack to people who arrived after it had a price.
 */
import { query } from "../src/db";
import { PACKS, packBySlug } from "../src/lib/packs";
import { brainsIn } from "../src/lib/pack-brains";

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
  const before = arg("before");
  if (!before || !/^\d{4}-\d{2}-\d{2}$/.test(before)) {
    console.error("pass --before YYYY-MM-DD: who counts as having been here already");
    process.exit(1);
  }
  const write = process.argv.includes("--write");

  const brains = await brainsIn(pack);
  const recipients = await query<{ id: string; email: string; already: boolean }>(
    `select u.id, u.email,
            exists (select 1 from pack_purchases pp
                     where pp.pack = $1 and pp.buyer_id = u.id) as already
       from "user" u
      where u."createdAt" < $2::date
      order by u.email`,
    [pack.slug, before],
  );
  const fresh = recipients.filter((r) => !r.already);

  console.log(
    `${pack.title} — ${brains.length} brains, ${pack.seats} seats\n` +
      `${recipients.length} account(s) registered before ${before}\n` +
      `${fresh.length} to gift, ${recipients.length - fresh.length} already hold it\n`,
  );
  for (const r of fresh) console.log(`  ${r.email}`);

  if (!write) {
    console.log("\ndry run — nothing written. Re-run with --write.");
    return;
  }
  if (!fresh.length) return;

  const ids = fresh.map((r) => r.id);
  await query(
    `insert into pack_purchases (pack, buyer_id, price_cents)
     select $1, id, 0 from unnest($2::text[]) as u(id)
     on conflict (pack, buyer_id) do nothing`,
    [pack.slug, ids],
  );

  // On the shelf too, for the same reason a bought pack lands there: a pack
  // nobody can see in /brains is a gift nobody notices they were given.
  await query(
    `insert into library (user_id, brain_id)
     select u.id, b.id
       from unnest($1::text[]) as u(id)
       cross join unnest($2::uuid[]) as b(id)
     on conflict do nothing`,
    [ids, brains.map((b) => b.id)],
  );

  console.log(`\ngifted ${fresh.length} account(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
