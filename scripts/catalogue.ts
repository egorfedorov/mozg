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
    // The docs site is a SvelteKit app that serves a JavaScript shell, so a
    // fetcher sees the word "Loading". The repository it is built from is the
    // better source anyway: the .svx files carry the API specs as data rather
    // than as rendered tables, so field types and required flags survive.
    key: "stake",
    repo: "StakeEngine/docs",
    prefix: "src/routes/docs/",
    endings: ["+page.svx"],
    topic: "gamedev",
    parent: {
      slug: "stake-engine",
      title: "Stake Engine",
      goal:
        "Answer any question about building and shipping a slot game on Stake " +
        "Engine: the RGS wallet endpoints and how a round is served, how the " +
        "maths model is built and simulated, how the frontend consumes its " +
        "events, what approval requires, and the platform facts a game is " +
        "launched with — currencies, dimensions, languages and URL structure.",
    },
    children: [
      {
        slug: "stake-engine-rgs-api",
        title: "Stake Engine · RGS API",
        goal:
          "Answer questions about the RGS wallet endpoints exactly as they are " +
          "specified: authenticate, balance, play, end-round, bet-replay and " +
          "event — the HTTP method and path of each, every request field with " +
          "its type and whether it is required, the response shape, the error " +
          "cases, and how amounts are expressed in minor currency units.",
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
          "Answer the flat factual questions: which currencies are supported " +
          "and how their minor units work, the required game dimensions, the " +
          "supported languages, what social mode changes, and the structure of " +
          "the URLs a game is launched with.",
        areas: ["reference", "example"],
      },
      {
        slug: "stake-engine-ai",
        title: "Stake Engine · AI integration",
        goal:
          "Answer how to use Stake Engine's own AI tooling: what its MCP " +
          "server exposes, how to connect it, and what the Hayden agent is for.",
        areas: ["ai-integration"],
      },
    ],
  },
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
      // Written from the specification, not from memory. The first version of
      // this goal asked about "the lifecycle from initialize to shutdown" —
      // and 2026-07-28 removed that handshake and made MCP stateless, so the
      // exam kept asking questions with a false premise and the brain kept
      // failing them honestly. The exam caught a wrong assumption in the goal,
      // which is exactly what it is for.
      goal:
        "Answer any question about the Model Context Protocol as it is " +
        "specified today: the JSON-RPC message shapes, the transports it " +
        "defines and their rules, how tools, resources and prompts are " +
        "declared and called, authorization, and which behaviours are " +
        "required of a client and of a server rather than merely suggested.",
    },
    children: [
      {
        slug: "mcp-spec",
        title: "MCP · Specification",
        goal:
          "Answer what the MCP specification requires: the exact JSON-RPC " +
          "request and response shapes for every method, error codes, how a " +
          "client and server agree on a protocol version, capabilities, and " +
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
    // Security guidance ages badly in a model's head: the cheat sheets are
    // revised continuously and are specified as checklists — exactly the
    // "paraphrase is a bug" material a brain exists for.
    key: "owasp",
    repo: "OWASP/CheatSheetSeries",
    prefix: "cheatsheets/",
    endings: [".md"],
    topic: "security",
    parent: {
      slug: "owasp-cheatsheets",
      title: "OWASP Cheat Sheets",
      goal:
        "Answer application-security questions the way the OWASP cheat " +
        "sheets specify today: the concrete controls for authentication, " +
        "session management, input validation, XSS, CSRF, SQL injection, " +
        "secrets, JWTs, file uploads and the rest — named headers, named " +
        "settings and named algorithms, not general advice.",
    },
    children: [],
  },
  {
    key: "asvs",
    repo: "OWASP/ASVS",
    // Only the current major — 4.0 sits beside it and contradicts it.
    prefix: "5.0/",
    endings: [".md"],
    topic: "security",
    parent: {
      slug: "owasp-asvs",
      title: "OWASP ASVS 5.0",
      goal:
        "Answer what the Application Security Verification Standard 5.0 " +
        "requires: each verification requirement by chapter and number, " +
        "which level it applies to, and what changed from 4.0.",
    },
    children: [],
  },
  {
    // The AI SDK ships breaking majors faster than models retrain, and its
    // provider matrix is a table nobody remembers correctly.
    key: "ai-sdk",
    repo: "vercel/ai",
    prefix: "content/",
    endings: [".mdx"],
    topic: "ai",
    parent: {
      slug: "ai-sdk",
      title: "Vercel AI SDK",
      goal:
        "Answer any question about the Vercel AI SDK as documented today: " +
        "the core generateText/streamText/tool APIs and their exact options, " +
        "every provider's setup and capabilities, and the cookbook recipes " +
        "for common patterns.",
    },
    children: [
      {
        slug: "ai-sdk-core",
        title: "AI SDK · Core",
        goal:
          "Answer questions about the AI SDK core APIs exactly as specified: " +
          "generateText, streamText, generateObject, tools and tool calling, " +
          "agents, UI hooks — each function's options, types and defaults.",
        areas: ["docs"],
      },
      {
        slug: "ai-sdk-providers",
        title: "AI SDK · Providers",
        goal:
          "Answer which AI SDK provider supports what: setup, model ids, " +
          "capabilities and provider-specific options for every provider in " +
          "the registry.",
        areas: ["providers"],
      },
      {
        slug: "ai-sdk-cookbook",
        title: "AI SDK · Cookbook",
        goal:
          "Answer how to implement common AI SDK patterns from the cookbook: " +
          "RAG, agents, streaming UIs, multimodal chat and the rest, with " +
          "working code shapes.",
        areas: ["cookbook"],
      },
    ],
  },
  {
    // The most-asked stack there is, and the one agents hallucinate hardest
    // on: models memorised the Pages Router era, the App Router rewrote the
    // mental model. The prefix deliberately excludes docs/02-pages — legacy
    // material in the same brain would resurrect exactly the confusion this
    // brain exists to end.
    key: "nextjs",
    repo: "vercel/next.js",
    prefix: "docs/01-app/",
    endings: [".mdx"],
    topic: "web",
    parent: {
      slug: "nextjs",
      title: "Next.js App Router",
      goal:
        "Answer questions about building Next.js applications with the App " +
        "Router as documented today: routing, layouts, server and client " +
        "components, data fetching and caching, server actions, and the " +
        "current API surface — not the Pages Router era the models memorised.",
    },
    children: [
      {
        slug: "nextjs-api",
        title: "Next.js · API reference",
        goal:
          "Answer questions about the Next.js API surface exactly as specified: " +
          "components, file conventions, functions, directives and config options.",
        areas: ["03-api-reference"],
      },
      {
        slug: "nextjs-guides",
        title: "Next.js · Guides",
        goal:
          "Answer questions from the Next.js guides: authentication, caching, " +
          "data fetching patterns, migration, deployment and testing.",
        areas: ["02-guides"],
      },
    ],
  },
  {
    // Expo ships SDK majors faster than any model retrains, and the docs
    // repo keeps every version side by side — the skip keeps out the 1000+
    // pages of older SDK copies that would make the brain contradict itself.
    key: "expo",
    repo: "expo/expo",
    prefix: "docs/pages/",
    endings: [".mdx"],
    skip: ["docs/pages/versions/", "docs/pages/ja/", "docs/pages/archive/", "docs/pages/internal/"],
    topic: "mobile",
    parent: {
      slug: "expo",
      title: "Expo & React Native",
      goal:
        "Answer questions about building mobile apps with Expo as documented " +
        "today: EAS Build, Update and Submit, Expo Router navigation, the " +
        "module API, config plugins, and the guides — current SDK behaviour, " +
        "not last year's.",
    },
    children: [
      {
        slug: "expo-eas",
        title: "Expo · EAS",
        goal:
          "Answer questions about EAS exactly as specified: Build profiles and " +
          "eas.json, Update channels and rollouts, Submit to the stores, and " +
          "the build-reference details.",
        areas: ["eas", "eas-update", "eas-insights", "build", "build-reference", "custom-builds", "workflow", "submit", "distribution"],
      },
      {
        slug: "expo-router",
        title: "Expo · Router",
        goal:
          "Answer questions about Expo Router: file-based routes, layouts, " +
          "navigation APIs, typed routes and the advanced patterns.",
        areas: ["router"],
      },
    ],
  },
  {
    // Svelte 5 rewrote the component model (runes, snippets, event
    // attributes) after most models learned Svelte 4 — the exact failure mode
    // a brain exists for: the model answers confidently in yesterday's syntax.
    key: "svelte",
    repo: "sveltejs/svelte.dev",
    prefix: "apps/svelte.dev/content/docs/",
    endings: [".md"],
    topic: "web",
    parent: {
      slug: "svelte",
      title: "Svelte 5 & SvelteKit",
      goal:
        "Answer any question about Svelte 5 and SvelteKit as they are " +
        "documented today: the runes reactivity model, component syntax, " +
        "SvelteKit routing, loading and deployment, and the CLI tooling — " +
        "in current syntax, never Svelte 4 idioms.",
    },
    children: [
      {
        slug: "svelte-5",
        title: "Svelte · Language",
        goal:
          "Answer questions about the Svelte 5 language exactly as specified: " +
          "each rune ($state, $derived, $effect, $props, $bindable and the " +
          "rest) with its precise semantics, snippets and render tags, event " +
          "attributes, component lifecycle, stores, and what replaced every " +
          "Svelte 4 pattern.",
        areas: ["svelte"],
      },
      {
        slug: "sveltekit",
        title: "Svelte · SvelteKit",
        goal:
          "Answer questions about SvelteKit: file-based routing, load " +
          "functions and their exact signatures, form actions, hooks, " +
          "adapters and deployment, prerendering, and configuration options " +
          "as they are named in the docs.",
        areas: ["kit"],
      },
      {
        slug: "svelte-tooling",
        title: "Svelte · CLI and AI tooling",
        goal:
          "Answer questions about the sv CLI (create, add, check, migrate " +
          "and their flags) and Svelte's AI/LLM integration docs.",
        areas: ["cli", "ai"],
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
  {
    // The backend-as-a-service surface models improvise on hardest: row level
    // security policies, auth flows and storage rules are specified precisely
    // enough that an invented policy is a security bug, and the platform keeps
    // shipping new products after every training cut.
    key: "supabase",
    repo: "supabase/supabase",
    prefix: "apps/docs/content/guides/",
    endings: [".mdx"],
    topic: "web",
    parent: {
      slug: "supabase",
      title: "Supabase",
      goal:
        "Answer questions about building on Supabase as documented today: " +
        "row level security and policies, the auth flows and their exact " +
        "configuration, the database features and extensions, storage rules, " +
        "edge functions, realtime, and how to run the platform locally and " +
        "self-hosted.",
    },
    children: [
      {
        slug: "supabase-auth",
        title: "Supabase · Auth",
        goal:
          "Answer questions about Supabase Auth exactly as specified: sign-up " +
          "and sign-in methods, OAuth providers and their setup, magic links " +
          "and OTP, MFA, session management, server-side auth, and how auth " +
          "users map to row level security policies.",
        areas: ["auth"],
      },
      {
        slug: "supabase-database",
        title: "Supabase · Database",
        goal:
          "Answer questions about the Supabase database: connecting from " +
          "every framework, query patterns with supabase-js, row level " +
          "security policies and their exact syntax, Postgres extensions, " +
          "full text search, indexes, migrations and connection pooling.",
        areas: ["database"],
      },
      {
        slug: "supabase-functions",
        title: "Supabase · Edge Functions",
        goal:
          "Answer questions about Supabase Edge Functions: creating and " +
          "deploying functions with the CLI, the Deno runtime and its limits, " +
          "handling requests and secrets, background tasks, and integrating " +
          "functions with auth and the database.",
        areas: ["functions"],
      },
      {
        slug: "supabase-storage",
        title: "Supabase · Storage",
        goal:
          "Answer questions about Supabase Storage exactly as specified: " +
          "buckets and their access levels, uploads and downloads from every " +
          "client, access control through storage RLS policies, image " +
          "transformations, resumable uploads and the CDN.",
        areas: ["storage"],
      },
      {
        slug: "supabase-realtime",
        title: "Supabase · Realtime",
        goal:
          "Answer questions about Supabase Realtime: postgres changes " +
          "subscriptions, broadcast and presence, channel configuration and " +
          "its options, authorization for realtime, quotas, and what changed " +
          "between realtime versions.",
        areas: ["realtime"],
      },
    ],
  },
  {
    // E2E test APIs churn between releases — locators, auto-waiting rules and
    // the test runner's configuration are quoted from memory and wrong. The
    // docs ship the same page in four languages side by side; the skip keeps
    // out python/java/csharp copies so the brain never mixes APIs across
    // languages.
    key: "playwright",
    repo: "microsoft/playwright",
    prefix: "docs/src/",
    endings: [".md"],
    skip: ["-python.md", "-java.md", "-csharp.md"],
    topic: "web",
    parent: {
      slug: "playwright",
      title: "Playwright",
      goal:
        "Answer questions about testing with Playwright as documented today: " +
        "locators and their strictness rules, actions and auto-waiting, " +
        "assertions, fixtures and test isolation, the configuration file and " +
        "every option, traces and debugging, and CI — the JavaScript/TypeScript " +
        "API, not another language's port.",
    },
    children: [
      {
        slug: "playwright-api",
        title: "Playwright · API reference",
        goal:
          "Answer questions about the Playwright library API exactly as " +
          "specified: every class — Browser, BrowserContext, Page, Locator, " +
          "Frame, Request, Response and the rest — with each method's " +
          "arguments, return types and default values.",
        areas: ["api"],
      },
      {
        slug: "playwright-test-api",
        title: "Playwright · Test runner API",
        goal:
          "Answer questions about the @playwright/test runner API: the test " +
          "and expect objects, fixtures, the config object and every reporter " +
          "with its options.",
        areas: ["test-api", "test-reporter-api"],
      },
    ],
  },
  {
    // An ORM's API is a paraphrase trap: models invent query-builder methods
    // and column types that almost exist. The docs live in a separate website
    // repository, not in drizzle-orm itself; release notes are skipped — a
    // brain answering from changelogs mixes old and new APIs.
    key: "drizzle",
    repo: "drizzle-team/drizzle-orm-docs",
    prefix: "src/content/docs/",
    endings: [".mdx"],
    skip: ["/latest-releases"],
    topic: "web",
    parent: {
      slug: "drizzle",
      title: "Drizzle ORM",
      goal:
        "Answer questions about Drizzle ORM as documented today: schema " +
        "declaration and column types, the query builder and relational " +
        "queries, migrations with drizzle-kit, transactions, relations, and " +
        "connecting to every supported database and driver.",
    },
    children: [
      {
        slug: "drizzle-pg",
        title: "Drizzle · PostgreSQL",
        goal:
          "Answer questions about Drizzle with PostgreSQL exactly as " +
          "specified: pg-core column types and constraints, indexes, the " +
          "query API for Postgres, and connecting through every Postgres " +
          "driver — node-postgres, postgres.js, Neon, Supabase and the rest.",
        areas: ["pg"],
      },
      {
        slug: "drizzle-sqlite",
        title: "Drizzle · SQLite",
        goal:
          "Answer questions about Drizzle with SQLite: sqlite-core column " +
          "types, the query API, and every SQLite driver — better-sqlite3, " +
          "libsql/Turso, D1, Bun and Expo SQLite.",
        areas: ["sqlite"],
      },
      {
        slug: "drizzle-mysql",
        title: "Drizzle · MySQL",
        goal:
          "Answer questions about Drizzle with MySQL: mysql-core column " +
          "types, the query API, and connecting through mysql2, PlanetScale " +
          "and the other supported drivers.",
        areas: ["mysql"],
      },
    ],
  },
  {
    // Small framework, exact API: middleware signatures, context helpers and
    // adapter specifics are easy to half-remember, and the framework ships
    // fast enough that training data mixes versions. One brain — Hono is one
    // job.
    key: "hono",
    repo: "honojs/website",
    prefix: "docs/",
    endings: [".md"],
    topic: "web",
    parent: {
      slug: "hono",
      title: "Hono",
      goal:
        "Answer questions about building web APIs with Hono as documented " +
        "today: routing and context, every built-in middleware and helper " +
        "with its exact options, validation, JSX, the RPC client, and " +
        "running on every runtime — Cloudflare Workers, Deno, Bun, Node and " +
        "the rest.",
    },
    children: [],
  },
  {
    // The whole cloudflare-docs repo holds every Cloudflare product; the
    // prefix scopes strictly to Workers, where the runtime APIs, bindings
    // and wrangler configuration are specified precisely enough that a
    // paraphrased wrangler.toml is a broken deploy.
    key: "cloudflare",
    repo: "cloudflare/cloudflare-docs",
    prefix: "src/content/docs/workers/",
    endings: [".mdx", ".md"],
    topic: "web",
    parent: {
      slug: "cloudflare-workers",
      title: "Cloudflare Workers",
      goal:
        "Answer questions about building on Cloudflare Workers as documented " +
        "today: the request/response lifecycle, bindings to KV, D1, R2, " +
        "Queues and Durable Objects, wrangler configuration, local " +
        "development and testing, observability, limits and pricing " +
        "relevant behaviour, and framework guides.",
    },
    children: [
      {
        slug: "cloudflare-runtime-apis",
        title: "Cloudflare Workers · Runtime APIs",
        goal:
          "Answer questions about the Workers runtime APIs exactly as " +
          "specified: fetch handlers and the Fetch API surface, Cache API, " +
          "WebSockets, Streams, KV, R2, D1, Durable Objects, Queues, " +
          "analytics and every other runtime binding with its methods and " +
          "options.",
        areas: ["runtime-apis"],
      },
      {
        slug: "cloudflare-wrangler",
        title: "Cloudflare Workers · Wrangler",
        goal:
          "Answer questions about wrangler and Worker configuration: every " +
          "wrangler command with its flags, the wrangler.toml/jsonc " +
          "configuration fields, environments, bindings declarations, " +
          "migrations for Durable Objects, and secrets management.",
        areas: ["wrangler", "configuration"],
      },
    ],
  },
  {
    // Models quote shadcn/ui component props and theming from whatever
    // version they memorised; the CLI, registry and CSS-variable theming are
    // documented precisely and changed with Tailwind v4. The changelog
    // directory is skipped — release notes would contradict the current docs.
    key: "shadcn",
    repo: "shadcn-ui/ui",
    prefix: "apps/v4/content/docs/",
    endings: [".mdx"],
    skip: ["/changelog"],
    topic: "web",
    parent: {
      slug: "shadcn-ui",
      title: "shadcn/ui",
      goal:
        "Answer questions about shadcn/ui as documented today: installation " +
        "per framework, the CLI and its commands, theming with CSS variables, " +
        "dark mode, the registry, and every component's usage and props.",
    },
    children: [
      {
        slug: "shadcn-components",
        title: "shadcn/ui · Components",
        goal:
          "Answer questions about each shadcn/ui component exactly as " +
          "documented: installation, usage examples, props and variants for " +
          "every component from accordion to typography.",
        areas: ["components"],
      },
    ],
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
  // Strip the file part first: SvelteKit puts the page at `api/+page.svx`, so
  // splitting on "/" alone makes the root page its own area called "+page.svx".
  const rel = path
    .slice(pack.prefix.length)
    .replace(/\/?\+page\.svx$/, "")
    .replace(/\.(md|mdx)$/, "");
  return rel.split("/")[0];
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
