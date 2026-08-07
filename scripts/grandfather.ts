/**
 * Grandfather the readers a brain had before it was priced.
 *
 *   npm run grandfather -- --pack igaming            # dry run, prints the plan
 *   npm run grandfather -- --pack igaming --write
 *   npm run grandfather -- --pack igaming --all-users --write
 *
 * Pricing a brain that people already use is a promise broken by default: the
 * next call from an agent that has been reading it for a month answers "buy
 * this at mozg.sh". So this runs BEFORE the price goes on, and it hands every
 * existing reader a permanent grant.
 *
 * Grants, not purchases, for two reasons found in the schema rather than
 * guessed at:
 *
 *   - `purchases` carries CHECK (price_cents > 0). A free purchase is not a
 *     row the database will accept, which is the schema saying what the table
 *     means: money changed hands.
 *   - even if it did, purchases_count_trg bumps brains.sales_count, so
 *     grandfathering would inflate a public number with sales that never
 *     happened.
 *
 * A grant says the true thing — this person may read this brain — is checked
 * before the paywall in lib/access.ts, shows up on the brain's share screen,
 * and can be taken back. Matching is on a verified email, so anyone who has
 * not verified theirs keeps reading only once they do.
 */
import { query } from "../src/db";

/** Named sets, so the thing being grandfathered is reviewable in a diff. */
const PACKS: Record<string, { parents: string[]; loose: string[] }> = {
  igaming: {
    parents: ["stake-engine", "slot-studio"],
    loose: [
      "slot-studio-compliance",
      "slot-animation-craft",
      "slot-art-direction",
      "pixijs-casino",
      "spine-2d-animation",
    ],
  },
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const packName = arg("pack") ?? "igaming";
  const pack = PACKS[packName];
  if (!pack) {
    console.error(`unknown pack "${packName}". Known: ${Object.keys(PACKS).join(", ")}`);
    process.exit(1);
  }
  const write = process.argv.includes("--write");
  // Default is the narrow set — people who actually touched these brains.
  // --all-users is the generous reading: everyone who had an account before
  // the price existed. Both are defensible; the flag makes it a decision
  // somebody typed rather than one a script assumed.
  const allUsers = process.argv.includes("--all-users");

  const brains = await query<{ id: string; slug: string; owner_id: string }>(
    `select b.id, b.slug, b.owner_id
       from brains b
       left join brains p on p.id = b.parent_id
      where b.slug = any($1) or p.slug = any($1) or b.slug = any($2)`,
    [pack.parents, pack.loose],
  );
  if (!brains.length) {
    console.error("no brains matched — check the slugs in PACKS");
    process.exit(1);
  }
  const brainIds = brains.map((b) => b.id);

  const readers = await query<{ id: string; email: string; verified: boolean; why: string }>(
    allUsers
      ? `select u.id, u.email, u."emailVerified" as verified, 'account' as why
           from "user" u order by u.email`
      : `select u.id, u.email, u."emailVerified" as verified,
                string_agg(distinct s.why, '+') as why
           from "user" u
           join (
             select caller_id as user_id, 'called' as why from calls
              where brain_id = any($1)
             union all
             select user_id, 'shelved' as why from library where brain_id = any($1)
           ) s on s.user_id = u.id
          group by 1, 2, 3 order by u.email`,
    allUsers ? [] : [brainIds],
  );

  const unverified = readers.filter((r) => !r.verified);

  console.log(`pack ${packName}: ${brains.length} brains`);
  console.log(brains.map((b) => `  ${b.slug}`).join("\n"));
  console.log(
    `\n${readers.length} reader(s) ${allUsers ? "(every existing account)" : "(called or shelved one of them)"}`,
  );
  for (const r of readers) console.log(`  ${r.email}  ${r.why}${r.verified ? "" : "  ⚠ unverified"}`);
  if (unverified.length) {
    console.log(
      `\n⚠ ${unverified.length} address(es) are unverified. The grant is written anyway — ` +
        `lib/access.ts matches on a verified address, so it starts working the day they verify.`,
    );
  }
  console.log(`\n${readers.length * brains.length} grant(s) at most, existing ones left alone.`);

  if (!write) {
    console.log("\ndry run — nothing written. Re-run with --write.");
    return;
  }

  // The owner invites: a grant carries who handed it out, and attributing it
  // to the brain's owner is the truth (the operator ran the script on their
  // behalf, but the standing is the owner's to give and to revoke).
  const result = await query<{ n: number }>(
    `insert into grants (brain_id, email, role, invited_by)
     select b.id, r.email, 'viewer', b.owner_id
       from brains b
       cross join unnest($2::text[]) as r(email)
      where b.id = any($1::uuid[])
     on conflict (brain_id, email) do nothing
     returning 1 as n`,
    [brainIds, readers.map((r) => r.email)],
  );
  console.log(`\nwrote ${result.length} new grant(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
