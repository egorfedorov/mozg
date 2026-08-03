/**
 * Build the Stake Engine brain family from the official documentation.
 *
 *   npm run seed:stake -- --owner egor@mozg.sh          # queue everything
 *   npm run seed:stake -- --owner egor@mozg.sh --dry    # show the plan only
 *   npm run seed:stake -- --owner egor@mozg.sh --limit 3
 *
 * The docs site is a SvelteKit app that ships an empty shell to a fetcher, so
 * the pages are read from the repository they are built from instead. That is
 * also the better source: the .svx files carry the API specs as data, not as
 * rendered tables.
 *
 * Idempotent. Re-running adds only pages that are not already sources, so it
 * is the way to pick up new documentation as it is written.
 */
import { one, maybeOne, query } from "@/db";
import { enqueueIngest } from "@/worker/queue";
import { slugify } from "@/lib/brains";

const REPO = "StakeEngine/docs";
const RAW = `https://raw.githubusercontent.com/${REPO}/HEAD/`;
const DOCS_PREFIX = "src/routes/docs/";

/**
 * One child per job, not one child per folder.
 *
 * The split follows what someone actually asks about — "how do I call the
 * wallet endpoints", "how do I model a tumble win" — because each child gets
 * its own goal, and the goal becomes the exam. A child covering both would be
 * scored on a question it was never meant to answer.
 */
interface Part {
  slug: string;
  title: string;
  goal: string;
  /** Path prefixes under src/routes/docs/ that belong to this child. */
  areas: string[];
}

const PARENT = {
  slug: "stake-engine",
  title: "Stake Engine",
  goal:
    "Point an agent at the right part of Stake Engine: what the platform is, " +
    "how a game reaches players, and which of the specialised brains under " +
    "this one answers a given question.",
  areas: ["", "architecture"],
};

const PARTS: Part[] = [
  {
    slug: "stake-engine-rgs-api",
    title: "Stake Engine · RGS API",
    goal:
      "Answer questions about the RGS wallet endpoints exactly as they are " +
      "specified: authenticate, balance, play, end-round, bet-replay and " +
      "event — the HTTP method and path of each, every request field with its " +
      "type and whether it is required, the response shape, the error cases, " +
      "and how amounts are expressed in minor currency units.",
    areas: ["api"],
  },
  {
    slug: "stake-engine-math-sdk",
    title: "Stake Engine · Math SDK",
    goal:
      "Answer questions about building a game's mathematics with the Math " +
      "SDK: the game format and state machine, how board, lines, ways, " +
      "cluster, scatter and tumble wins are calculated, how betmodes and " +
      "distributions are configured, what simulation produces, and which " +
      "files the toolchain reads and writes.",
    areas: ["math-sdk"],
  },
  {
    slug: "stake-engine-web-sdk",
    title: "Stake Engine · Web SDK",
    goal:
      "Answer questions about building the game frontend with the Web SDK: " +
      "the file structure of a game, how context and state are shared, how " +
      "events from the maths are consumed and animated, the UI components " +
      "provided, and how Storybook is used to develop them.",
    areas: ["web-sdk"],
  },
  {
    slug: "stake-engine-approval",
    title: "Stake Engine · Approval",
    goal:
      "Answer what a game must satisfy before Stake Engine will approve it: " +
      "the submission checklist, the maths requirements, the frontend " +
      "requirements, the RGS requirements, the game tile specification and " +
      "the quality bar — including the things that get a submission rejected.",
    areas: ["approval"],
  },
  {
    slug: "stake-engine-reference",
    title: "Stake Engine · Reference",
    goal:
      "Answer the flat factual questions: which currencies are supported and " +
      "how their minor units work, the required game dimensions, the " +
      "supported languages, what social mode changes, and the structure of " +
      "the URLs a game is launched with.",
    areas: ["reference", "example"],
  },
  {
    slug: "stake-engine-ai",
    title: "Stake Engine · AI integration",
    goal:
      "Answer how to use Stake Engine's own AI tooling: what its MCP server " +
      "exposes, how to connect it, and what the Hayden agent is for.",
    areas: ["ai-integration"],
  },
];

interface Args {
  owner: string;
  dry: boolean;
  limit: number | null;
  public: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    owner: get("owner") ?? "",
    dry: argv.includes("--dry"),
    limit: get("limit") ? Number(get("limit")) : null,
    public: !argv.includes("--private"),
  };
}

/** Every documentation page in the repo, as raw URLs. */
async function docPages(): Promise<string[]> {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/git/trees/HEAD?recursive=1`,
    { headers: { accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(30_000) },
  );
  if (!res.ok) throw new Error(`GitHub tree -> ${res.status}`);
  const tree = (await res.json()) as { tree: { path: string }[] };

  return tree.tree
    .map((t) => t.path)
    .filter((p) => p.startsWith(DOCS_PREFIX) && p.endsWith("+page.svx"))
    .sort();
}

/** Which child a page belongs to, by its first path segment. */
function areaOf(path: string): string {
  const rel = path.slice(DOCS_PREFIX.length).replace(/\/?\+page\.svx$/, "");
  return rel.split("/")[0] || "";
}

async function upsertBrain(
  ownerId: string,
  spec: { slug: string; title: string; goal: string },
  parentId: string | null,
): Promise<{ id: string; created: boolean }> {
  const existing = await maybeOne<{ id: string }>(
    `select id from brains where owner_id = $1 and slug = $2`,
    [ownerId, spec.slug],
  );
  if (existing) {
    await query(
      `update brains set title = $2, goal = $3, parent_id = $4, topic = 'gamedev'
        where id = $1`,
      [existing.id, spec.title, spec.goal, parentId],
    );
    return { id: existing.id, created: false };
  }

  const brain = await one<{ id: string }>(
    `insert into brains (owner_id, slug, title, goal, topic, parent_id)
     values ($1, $2, $3, $4, 'gamedev', $5) returning id`,
    [ownerId, spec.slug, spec.title, spec.goal, parentId],
  );
  return { id: brain.id, created: true };
}

async function main() {
  const args = parseArgs();
  if (!args.owner) {
    console.error("\nPass --owner <email>. That account will own the family.\n");
    process.exit(1);
  }

  const owner = await maybeOne<{ id: string; email: string }>(
    `select id, email from "user" where lower(email) = lower($1)`,
    [args.owner],
  );
  if (!owner) {
    console.error(`\nNo account for ${args.owner}. Sign in once first.\n`);
    process.exit(1);
  }

  console.log(`\nreading ${REPO}`);
  const pages = await docPages();
  console.log(`  ${pages.length} documentation pages`);

  // Plan first, so a dry run shows exactly what a real run would do.
  const plan = new Map<string, string[]>();
  const unclaimed: string[] = [];

  for (const path of pages) {
    const area = areaOf(path);
    const part =
      PARTS.find((p) => p.areas.includes(area)) ??
      (PARENT.areas.includes(area) ? PARENT : null);
    if (!part) {
      unclaimed.push(path);
      continue;
    }
    plan.set(part.slug, [...(plan.get(part.slug) ?? []), path]);
  }

  console.log("\nplan");
  for (const spec of [PARENT, ...PARTS]) {
    const paths = plan.get(spec.slug) ?? [];
    console.log(`  ${spec.slug.padEnd(28)} ${String(paths.length).padStart(3)} pages`);
  }
  if (unclaimed.length) {
    // Not silently dropped: a new documentation area should be visible, not
    // absorbed into whichever child happens to sort first.
    console.log(`\n  ${unclaimed.length} page(s) belong to no child yet:`);
    for (const p of unclaimed) console.log(`    ${areaOf(p)} — ${p}`);
    console.log("  add an area to PARTS in this script to pick them up.");
  }

  if (args.dry) {
    console.log("\n(dry run — nothing written)\n");
    process.exit(0);
  }

  const parent = await upsertBrain(owner.id, PARENT, null);
  console.log(`\n${parent.created ? "created" : "updated"} parent ${PARENT.slug}`);

  let queued = 0;
  let already = 0;

  for (const spec of [PARENT, ...PARTS]) {
    const isParent = spec.slug === PARENT.slug;
    const brain = isParent
      ? parent
      : await upsertBrain(owner.id, spec, parent.id);
    if (!isParent) {
      console.log(`${brain.created ? "created" : "updated"} ${spec.slug}`);
    }

    if (args.public) {
      await query(
        `update brains set visibility = 'public', license = 'nc', price_cents = 0
          where id = $1`,
        [brain.id],
      );
    }

    const paths = plan.get(spec.slug) ?? [];
    const take = args.limit ? paths.slice(0, args.limit) : paths;

    for (const path of take) {
      const url = RAW + path;
      const seen = await maybeOne(`select 1 from sources where brain_id = $1 and url = $2`, [
        brain.id,
        url,
      ]);
      if (seen) {
        already++;
        continue;
      }

      const name = path.slice(DOCS_PREFIX.length).replace(/\/?\+page\.svx$/, "") || "index";
      const source = await one<{ id: string }>(
        `insert into sources (brain_id, kind, url, original_name)
         values ($1, 'url', $2, $3) returning id`,
        [brain.id, url, name],
      );
      await enqueueIngest(source.id);
      queued++;
    }
  }

  console.log(
    `\nqueued ${queued} page(s), ${already} already present.\n` +
      "The worker reads them in the background; each brain sits its exam once\n" +
      `its pages are in. Watch progress at /brains/${PARENT.slug}.\n`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("\n" + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
