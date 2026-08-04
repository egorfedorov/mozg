/**
 * Seed the paid marketplace brains from hand-authored note packs.
 *
 *   npm run paid -- --owner egor@mozg.sh --dry
 *   npm run paid -- --owner egor@mozg.sh --only auditor
 *   npm run paid -- --owner egor@mozg.sh
 *
 * Paid brains are the opposite of the catalogue seeder: their value is that the
 * content exists nowhere public, so there is no repository to crawl — the notes
 * are written by an expert and inserted directly (same path as scripts/seed.ts),
 * which keeps every word of the merchandise intact instead of round-tripping it
 * through an extractor. Each pack is a content/paid/<key>.ts module.
 *
 * Re-running replaces the pack's own notes (author = 'human'), so the pack file
 * is the source of truth. Agent- and owner-written notes are kept.
 */
import { one, maybeOne, query, toVector } from "@/db";
import type { Brain } from "@/db/types";
import { chunksForNote, estimateTokens } from "@/lib/chunk";
import { embedPassages, embedHealthy } from "@/lib/embed";
import { NOTES as complianceNotes } from "../content/paid/compliance";
import { NOTES as auditorNotes } from "../content/paid/auditor";
import { NOTES as appstoreNotes } from "../content/paid/appstore";
import { NOTES as quantNotes } from "../content/paid/quant";

export interface PaidNote {
  title: string;
  body: string;
  category: string;
  kind: "fact" | "rule" | "layout" | "example" | "pitfall";
}

interface PaidPack {
  key: string;
  slug: string;
  title: string;
  goal: string;
  topic: string;
  priceCents: number;
  load: () => Promise<PaidNote[]>;
}

const PAID: PaidPack[] = [
  {
    key: "compliance",
    slug: "slot-studio-compliance",
    title: "Slot Studio · Compliance",
    goal:
      "Answer what a casino or social-casino game may and may not say, show " +
      "and promise: stake.us and sweepstakes wording rules, prohibited terms " +
      "and their safe replacements, jurisdiction gating, paytable and rules " +
      "copy requirements, responsible-gambling obligations, and the exact " +
      "messaging that gets a submission or a page rejected.",
    topic: "gamedev",
    priceCents: 1900,
    load: async () => complianceNotes,
  },
  {
    key: "auditor",
    slug: "smart-contract-auditor",
    title: "Smart Contract Auditor",
    goal:
      "Answer like a security auditor reviewing EVM smart contracts: the " +
      "concrete vulnerability patterns (reentrancy, oracle manipulation, " +
      "access control, signature replay, rounding and the rest), how each is " +
      "exploited in practice with real incident mechanics, how to detect it " +
      "in code, and the specific fix — with tool commands and checklist " +
      "items, not general advice.",
    topic: "security",
    priceCents: 4900,
    load: async () => auditorNotes,
  },
  {
    key: "appstore",
    slug: "app-store-review",
    title: "App Store & Google Play Review",
    goal:
      "Answer what actually gets apps rejected by App Store Review and " +
      "Google Play review: the specific guideline clauses invoked most " +
      "often, the behaviours reviewers test, the metadata and screenshot " +
      "rules, how to write replies that get a rejection overturned, and " +
      "the workarounds that pass versus the ones that get accounts banned.",
    topic: "mobile",
    priceCents: 1900,
    load: async () => appstoreNotes,
  },
  {
    key: "quant",
    slug: "quant-exchange-apis",
    title: "Quant · Exchange APIs",
    goal:
      "Answer the practical questions of trading-bot development on crypto " +
      "exchanges (Binance, Bybit, OKX via REST/WebSocket and CCXT): " +
      "authentication and request signing, rate limits and their weights, " +
      "order types and their actual behaviour, precision and rounding " +
      "rules, funding and fees, reconnect and state-recovery recipes, and " +
      "the production pitfalls that lose money.",
    topic: "trading",
    priceCents: 2900,
    load: async () => quantNotes,
  },
];

interface Args {
  owner: string;
  dry: boolean;
  only: string | null;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (n: string) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    owner: get("owner") ?? "",
    dry: argv.includes("--dry"),
    only: get("only") ?? null,
  };
}

async function seedPaid(pack: PaidPack, ownerId: string, dry: boolean): Promise<void> {
  const notes = await pack.load();
  console.log(`\n${pack.title} — ${notes.length} notes, $${(pack.priceCents / 100).toFixed(2)}`);
  if (dry) return;

  let brain = await maybeOne<Brain>(
    `select * from brains where owner_id = $1 and slug = $2`,
    [ownerId, pack.slug],
  );

  if (!brain) {
    brain = await one<Brain>(
      `insert into brains (owner_id, slug, title, goal, topic, review_required)
       values ($1, $2, $3, $4, $5, true) returning *`,
      [ownerId, pack.slug, pack.title, pack.goal, pack.topic],
    );
    console.log("  · created");
  } else {
    await query(`update brains set title = $2, goal = $3, topic = $4 where id = $1`,
      [brain.id, pack.title, pack.goal, pack.topic]);
    // Replace only the pack's own notes; agent and owner additions survive.
    await query(`delete from notes where brain_id = $1 and author = 'human'`, [brain.id]);
    console.log("  · refreshed human notes");
  }

  // Paid brains are public in the catalogue (5 free queries sell them), but
  // the content is the product: export stays off under the proprietary license.
  await query(
    `update brains set visibility = 'public', license = 'proprietary', price_cents = $2
      where id = $1`,
    [brain.id, pack.priceCents],
  );

  const healthy = await embedHealthy();
  if (!healthy) throw new Error("embedding service is down — start services/embed/run.sh");

  for (const note of notes) {
    const { id } = await one<{ id: string }>(
      `insert into notes (brain_id, title, body, category, kind, author, confidence)
       values ($1, $2, $3, $4, $5, 'human', 1.0) returning id`,
      [brain.id, note.title, note.body, note.category, note.kind],
    );

    const texts = chunksForNote(note.title, note.body);
    const vectors = await embedPassages(texts);
    for (let i = 0; i < texts.length; i++) {
      await query(
        `insert into chunks (brain_id, note_id, content, token_count, embedding)
         values ($1, $2, $3, $4, $5)`,
        [brain.id, id, texts[i], estimateTokens(texts[i]), toVector(vectors[i])],
      );
    }
  }
  console.log(`  · ${notes.length} notes embedded`);
}

async function main() {
  const args = parseArgs();
  if (!args.owner) {
    console.error("\nPass --owner <email>.\n");
    process.exit(1);
  }
  const owner = await maybeOne<{ id: string }>(
    `select id from "user" where lower(email) = lower($1)`,
    [args.owner],
  );
  if (!owner) {
    console.error(`\nNo account for ${args.owner}.\n`);
    process.exit(1);
  }

  const packs = args.only ? PAID.filter((p) => p.key === args.only) : PAID;
  if (!packs.length) {
    console.error(`\nNo pack "${args.only}". Known: ${PAID.map((p) => p.key).join(", ")}\n`);
    process.exit(1);
  }

  for (const pack of packs) await seedPaid(pack, owner.id, args.dry);
  console.log(args.dry ? "\n(dry run — nothing written)\n" : "\nDone. Now run the exams.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n" + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
