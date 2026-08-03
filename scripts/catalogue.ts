/**
 * Seed the public catalogue from documentation repositories.
 *
 *   npm run catalogue -- --owner egor@mozg.sh --dry
 *   npm run catalogue -- --owner egor@mozg.sh --only mcp
 *   npm run catalogue -- --owner egor@mozg.sh
 *
 * The Stake Engine seeder proved the recipe: read the repository a docs site is
 * built from, not the rendered site. Most doc sites now ship a JavaScript shell
 * that a fetcher sees as the word "Loading", and the source markdown is better
 * material anyway — API specs arrive as data instead of as rendered tables.
 *
 * Which repositories, and how they split into brains, is data below. Adding a
 * subject is an entry here, not a new script.
 */
import { one, maybeOne, query } from "@/db";
import { enqueueIngest } from "@/worker/queue";
import { setGoal } from "@/lib/goal";

interface Pack {
  /** Short key for --only. */
  key: string;
  repo: string;
  /** Where docs live in the repo. */
  prefix: string;
  /** File endings that are documentation. */
  endings: string[];
  topic: string;
  parent: { slug: string; title: string; goal: string };
  children: { slug: string; title: string; goal: string; areas: string[] }[];
  /** Paths matching these are skipped — changelogs, templates, i18n copies. */
  skip?: string[];
  /**
   * Set when the repository keeps every published version side by side. Only
   * the newest dated directory is kept: a brain holding six versions of one
   * protocol contradicts itself on every detail, which is worse than having
   * no brain at all.
   */
  versioned?: boolean;
}

/** Directories named like a release date, e.g. 2026-07-28. */
const DATED = /(^|\/)(\d{4}-\d{2}-\d{2})(\/|$)/;

/**
 * Keep only the newest dated directory, and drop drafts. Detected rather than
 * listed, so the pack stays correct when the next version lands instead of
 * quietly seeding a stale one.
 */
function currentVersionOnly(paths: string[]): { kept: string[]; version: string | null } {
  const versions = new Set<string>();
  for (const p of paths) {
    const m = p.match(DATED);
    if (m) versions.add(m[2]);
  }
  if (!versions.size) return { kept: paths, version: null };

  const newest = [...versions].sort().at(-1)!;
  return {
    kept: paths.filter((p) => {
      if (p.includes("/draft/")) return false;
      const m = p.match(DATED);
      return !m || m[2] === newest;
    }),
    version: newest,
  };
}

/**
 * What belongs in a free brain: things a model gets wrong.
 *
 * A brain full of documentation the model already memorised is a waste of
 * everyone's tokens. These are chosen because they changed after training, or
 * because they are specified precisely enough that a paraphrase is wrong —
 * which is exactly where an agent needs a source of truth.
 */
const PACKS: Pack[] = [
  {
    key: "mcp",
    repo: "modelcontextprotocol/modelcontextprotocol",
    prefix: "docs/",
    endings: [".md", ".mdx"],
    topic: "ai",
    // seps are proposals, not the protocol — a brain that cannot tell a
    // proposal from a requirement is worse than one that has never heard of
    // either. snippets and development are repository housekeeping.
    skip: [
      "docs/changelog",
      "/legacy/",
      "docs/community",
      "docs/seps",
      "docs/snippets",
      "docs/development",
    ],
    versioned: true,
    parent: {
      slug: "mcp",
      title: "Model Context Protocol",
      goal:
        "Answer any question about the Model Context Protocol as specified: " +
        "the JSON-RPC messages and their exact shapes, the lifecycle from " +
        "initialize to shutdown, tools, resources and prompts, transports, " +
        "authorization, and what a client and a server each must do.",
    },
    children: [
      {
        slug: "mcp-spec",
        title: "MCP · Specification",
        goal:
          "Answer what the MCP specification requires: the exact JSON-RPC " +
          "request and response shapes for every method, error codes, the " +
          "initialize handshake and version negotiation, capabilities, and " +
          "which behaviours are MUST rather than SHOULD.",
        areas: ["specification"],
      },
      {
        slug: "mcp-build",
        title: "MCP · Building servers and clients",
        goal:
          "Answer how to actually build an MCP server or client: transports " +
          "and when to use each, how tools, resources and prompts are declared " +
          "and called, and the mistakes that make a server work in one client " +
          "and not another.",
        areas: [
          "develop",
          "quickstart",
          "tutorials",
          "docs",
          "sdk",
          "learn",
          "extensions",
          "registry",
        ],
      },
    ],
  },
  {
    key: "tailwind",
    repo: "tailwindlabs/tailwindcss.com",
    prefix: "src/docs/",
    endings: [".mdx"],
    topic: "web",
    parent: {
      slug: "tailwind-v4",
      title: "Tailwind CSS v4",
      goal:
        "Answer questions about Tailwind CSS v4 specifically: the CSS-first " +
        "configuration that replaced tailwind.config.js, the @theme and @utility " +
        "directives, what changed from v3 and how to upgrade, and the utility " +
        "classes as they exist in v4.",
    },
    children: [],
  },
];

interface Args {
  owner: string;
  dry: boolean;
  only: string | null;
  limit: number | null;
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
    limit: get("limit") ? Number(get("limit")) : null,
  };
}

async function docPages(pack: Pack): Promise<string[]> {
  const res = await fetch(
    `https://api.github.com/repos/${pack.repo}/git/trees/HEAD?recursive=1`,
    {
      headers: { accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!res.ok) throw new Error(`${pack.repo} tree -> ${res.status}`);
  const tree = (await res.json()) as { tree: { path: string; type: string }[] };

  return tree.tree
    .filter((t) => t.type === "blob")
    .map((t) => t.path)
    .filter(
      (p) =>
        p.startsWith(pack.prefix) &&
        pack.endings.some((e) => p.endsWith(e)) &&
        !(pack.skip ?? []).some((s) => p.includes(s)),
    )
    .sort();
}

function areaOf(pack: Pack, path: string): string {
  const rel = path.slice(pack.prefix.length);
  return rel.split("/")[0].replace(/\.(md|mdx)$/, "");
}

async function upsert(
  ownerId: string,
  spec: { slug: string; title: string; goal: string },
  topic: string,
  parentId: string | null,
): Promise<{ id: string; created: boolean }> {
  const existing = await maybeOne<{ id: string }>(
    `select id from brains where owner_id = $1 and slug = $2`,
    [ownerId, spec.slug],
  );
  if (existing) {
    await query(
      `update brains set title = $2, parent_id = $3, topic = $4 where id = $1`,
      [existing.id, spec.title, parentId, topic],
    );
    await setGoal(existing.id, spec.goal);
    return { id: existing.id, created: false };
  }
  const brain = await one<{ id: string }>(
    `insert into brains (owner_id, slug, title, goal, topic, parent_id)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [ownerId, spec.slug, spec.title, spec.goal, topic, parentId],
  );
  return { id: brain.id, created: true };
}

async function seedPack(pack: Pack, ownerId: string, args: Args): Promise<number> {
  console.log(`\n${pack.repo}`);
  let pages = await docPages(pack);
  console.log(`  ${pages.length} pages under ${pack.prefix}`);

  if (pack.versioned) {
    const { kept, version } = currentVersionOnly(pages);
    console.log(
      `  keeping ${kept.length} from version ${version ?? "—"}` +
        ` (dropped ${pages.length - kept.length} older or draft)`,
    );
    pages = kept;
  }
  if (!pages.length) return 0;

  // A pack with no children is one brain holding everything, which is right
  // when the subject really is one job.
  const plan = new Map<string, string[]>();
  for (const path of pages) {
    const area = areaOf(pack, path);
    const child = pack.children.find((c) => c.areas.includes(area));
    plan.set(
      child?.slug ?? pack.parent.slug,
      [...(plan.get(child?.slug ?? pack.parent.slug) ?? []), path],
    );
  }

  for (const [slug, paths] of plan) {
    console.log(`    ${slug.padEnd(24)} ${String(paths.length).padStart(4)} pages`);
  }
  if (args.dry) return 0;

  const parent = await upsert(ownerId, pack.parent, pack.topic, null);
  let queued = 0;

  for (const spec of [pack.parent, ...pack.children]) {
    const isParent = spec.slug === pack.parent.slug;
    const brain = isParent
      ? parent
      : await upsert(ownerId, spec, pack.topic, parent.id);

    await query(
      `update brains set visibility = 'public', license = 'nc', price_cents = 0
        where id = $1`,
      [brain.id],
    );

    const paths = plan.get(spec.slug) ?? [];
    for (const path of args.limit ? paths.slice(0, args.limit) : paths) {
      const url = `https://raw.githubusercontent.com/${pack.repo}/HEAD/${path}`;
      const seen = await maybeOne(
        `select 1 from sources where brain_id = $1 and url = $2`,
        [brain.id, url],
      );
      if (seen) continue;

      const source = await one<{ id: string }>(
        `insert into sources (brain_id, kind, url, original_name)
         values ($1, 'url', $2, $3) returning id`,
        [brain.id, url, path.slice(pack.prefix.length)],
      );
      await enqueueIngest(source.id);
      queued++;
    }
  }

  console.log(`  queued ${queued}`);
  return queued;
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

  const packs = args.only ? PACKS.filter((p) => p.key === args.only) : PACKS;
  if (!packs.length) {
    console.error(`\nNo pack "${args.only}". Known: ${PACKS.map((p) => p.key).join(", ")}\n`);
    process.exit(1);
  }

  let total = 0;
  for (const pack of packs) total += await seedPack(pack, owner.id, args);

  console.log(
    args.dry
      ? "\n(dry run — nothing written)\n"
      : `\nqueued ${total} page(s). The worker reads them in the background.\n`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("\n" + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
