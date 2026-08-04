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

/**
 * Pages that cost a model call and yield nothing, in every repository:
 * contributor lists, changelogs, licences, translation stubs, and the
 * community-provider directories that are one link each. Measured, not
 * guessed — fifty paid-for-nothing extractions in one day's seeding were
 * all of these shapes.
 */
const JUNK: RegExp[] = [
  /contributors?/i,
  /changelog/i,
  /^.*\/(license|licence|code[-_]of[-_]conduct|security)\.(md|mdx)$/i,
  /community[-_]providers?\//i,
  /\/(acknowledge?ments?|credits|sponsors)/i,
  /\/(migration[-_]guide|upgrade[-_]guide)s?\/(v?\d|legacy)/i,
];

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
  {
    // Vite ships a major a year and each one renames config options and
    // deprecates plugin hooks — models answer with the major they memorised.
    // blog and changes are release notes; releases.md is policy, not usage.
    key: "vite",
    repo: "vitejs/vite",
    prefix: "docs/",
    endings: [".md"],
    skip: [
      "docs/blog",
      "docs/changes",
      "docs/releases.md",
      "docs/team.md",
      "docs/live.md",
    ],
    topic: "web",
    parent: {
      slug: "vite",
      title: "Vite",
      goal:
        "Answer questions about Vite as documented today: the dev server and " +
        "how HMR works, the features pages (TypeScript, JSX, CSS, assets, " +
        "env variables and modes), building for production, the plugin API " +
        "and its hooks, SSR, backend integration, and every config option " +
        "with its type and default — current behaviour, not last major's.",
    },
    children: [
      {
        slug: "vite-guide",
        title: "Vite · Guide",
        goal:
          "Answer questions from the Vite guide: dependency pre-bundling and " +
          "when it breaks, HMR and its client API, how imports of CSS, JSON, " +
          "workers and static assets behave, env variables and modes, SSR " +
          "and backend integration, and the troubleshooting entries.",
        areas: ["guide"],
      },
      {
        slug: "vite-config",
        title: "Vite · Config reference",
        goal:
          "Answer questions about Vite configuration exactly as specified: " +
          "every shared, server, build, preview, dependency-optimisation and " +
          "worker option with its name, type and default value.",
        areas: ["config"],
      },
    ],
  },
  {
    // Vitest's config surface is huge and churns between majors — reporters,
    // coverage providers and browser mode options are quoted from memory and
    // wrong. blog, team and releases are housekeeping.
    key: "vitest",
    repo: "vitest-dev/vitest",
    prefix: "docs/",
    endings: [".md"],
    skip: [
      "docs/blog",
      "docs/team.md",
      "docs/releases.md",
      "docs/todo.md",
    ],
    topic: "web",
    parent: {
      slug: "vitest",
      title: "Vitest",
      goal:
        "Answer questions about testing with Vitest as documented today: " +
        "writing tests and assertions, mocking with vi, the config file and " +
        "every option, coverage providers, browser mode, workspaces, the " +
        "CLI and its flags — the current API, not an earlier major's.",
    },
    children: [
      {
        slug: "vitest-guide",
        title: "Vitest · Guide",
        goal:
          "Answer questions from the Vitest guide: writing and running " +
          "tests, mocking functions, modules and timers with vi, snapshot " +
          "testing, coverage, browser mode, workspaces, test context and " +
          "the CLI commands with their flags.",
        areas: ["guide"],
      },
      {
        slug: "vitest-api",
        title: "Vitest · API reference",
        goal:
          "Answer questions about the Vitest API exactly as specified: " +
          "describe, test, expect and the vi object with every method's " +
          "signature, and every assertion matcher with its behaviour.",
        areas: ["api"],
      },
      {
        slug: "vitest-config",
        title: "Vitest · Config reference",
        goal:
          "Answer questions about Vitest configuration exactly as specified: " +
          "every test, coverage, browser, pool and reporter option with its " +
          "name, type and default value.",
        areas: ["config"],
      },
    ],
  },
  {
    // Models answer React questions in class-component and pre-hooks idioms
    // they memorised; react.dev documents the current model and, uniquely,
    // the compiler errors and warnings verbatim — the pages where quoting a
    // paraphrase is quoting the wrong error. blog and community are not the
    // library.
    key: "react",
    repo: "reactjs/react.dev",
    prefix: "src/content/",
    endings: [".md"],
    skip: ["src/content/blog", "src/content/community"],
    topic: "web",
    parent: {
      slug: "react",
      title: "React",
      goal:
        "Answer questions about React as documented on react.dev today: " +
        "components and JSX, state and the rules of hooks, effects and when " +
        "not to use them, the reference API with each hook's exact signature " +
        "and rules, and the compiler errors and warnings as they are worded.",
    },
    children: [
      {
        slug: "react-learn",
        title: "React · Learn",
        goal:
          "Answer questions from the React learn docs: describing the UI, " +
          "adding interactivity with state, managing state with reducers and " +
          "context, escape hatches — refs, effects and their lifecycle — " +
          "and installation and setup for every framework.",
        areas: ["learn"],
      },
      {
        slug: "react-reference",
        title: "React · API reference",
        goal:
          "Answer questions about the React API exactly as specified: every " +
          "hook, component, directive and API in react and react-dom with " +
          "its signature, parameters, return value and usage rules.",
        areas: ["reference"],
      },
      {
        slug: "react-errors",
        title: "React · Errors and warnings",
        goal:
          "Answer questions about a specific React error or warning message: " +
          "what the message says verbatim, what causes it and how to fix it.",
        areas: ["errors", "warnings"],
      },
    ],
  },
  {
    // Vue 3's Composition API and <script setup> postdate most training
    // data, which still answers in Options API. The docs repo ships about,
    // partners and sponsor pages beside the docs — housekeeping, not Vue.
    key: "vue",
    repo: "vuejs/docs",
    prefix: "src/",
    endings: [".md"],
    skip: ["src/about", "src/partners", "src/sponsor", "src/translations"],
    topic: "web",
    parent: {
      slug: "vue",
      title: "Vue",
      goal:
        "Answer questions about Vue 3 as documented today: the reactivity " +
        "system and its APIs, single-file components and <script setup>, " +
        "the Composition API, template syntax and directives, built-in " +
        "components, and the API reference with exact signatures.",
    },
    children: [
      {
        slug: "vue-guide",
        title: "Vue · Guide",
        goal:
          "Answer questions from the Vue guide: reactivity fundamentals, " +
          "computed and watchers, template syntax and every directive, " +
          "components — props, emits, slots and provide/inject — " +
          "composables, transitions, routing and state management, and the " +
          "best-practice and performance pages.",
        areas: ["guide"],
      },
      {
        slug: "vue-api",
        title: "Vue · API reference",
        goal:
          "Answer questions about the Vue API exactly as specified: every " +
          "global and composition API, built-in directive and component, " +
          "compiler option and runtime flag with its signature and options.",
        areas: ["api"],
      },
      {
        slug: "vue-tutorial",
        title: "Vue · Tutorial",
        goal:
          "Answer questions following the official Vue tutorial: each step " +
          "from declarative rendering through component basics, with the " +
          "exact syntax the tutorial teaches.",
        areas: ["tutorial"],
      },
    ],
  },
  {
    // Astro's islands model and content collections changed shape across
    // majors, and models answer in the version they memorised. The docs repo
    // is heavily i18n'd — the prefix pins the English content so the brain
    // never sees the same page in twelve languages.
    key: "astro",
    repo: "withastro/docs",
    prefix: "src/content/docs/en/",
    endings: [".mdx", ".md"],
    topic: "web",
    parent: {
      slug: "astro",
      title: "Astro",
      goal:
        "Answer questions about Astro as documented today: .astro " +
        "components and the islands architecture, routing and pages, " +
        "content collections, integrations, rendering modes and adapters, " +
        "the configuration reference with every option, and the error " +
        "reference entries as they are worded.",
    },
    children: [
      {
        slug: "astro-guides",
        title: "Astro · Guides",
        goal:
          "Answer questions from the Astro guides: connecting CMSs and " +
          "backends, deploying to every platform with its adapter and " +
          "settings, adding integrations, migrating a site to Astro, and " +
          "the media and image guides.",
        areas: ["guides"],
      },
      {
        slug: "astro-reference",
        title: "Astro · Reference",
        goal:
          "Answer questions about the Astro reference exactly as specified: " +
          "every configuration option with its type and default, the " +
          "runtime APIs, template directives, adapter API, and each error " +
          "message with its cause and fix.",
        areas: ["reference"],
      },
      {
        slug: "astro-tutorial",
        title: "Astro · Tutorial",
        goal:
          "Answer questions following the official build-a-blog tutorial: " +
          "each unit from setup through pages, components, layouts, the " +
          "Astro API and islands, in the order the tutorial teaches them.",
        areas: ["tutorial"],
      },
      {
        slug: "astro-recipes",
        title: "Astro · Recipes",
        goal:
          "Answer how to implement the documented Astro recipes: RSS, " +
          "sitemaps, i18n, authentication, forms, Docker deployment and the " +
          "rest, with working code shapes.",
        areas: ["recipes"],
      },
    ],
  },
  {
    // FastAPI's docs ship in a dozen languages inside one repo — the prefix
    // pins English. Dependency injection, security flows and status-code
    // handling are specified precisely and quoted from memory sloppily.
    // release-notes and the _llm-test probe page are not the framework.
    key: "fastapi",
    repo: "tiangolo/fastapi",
    prefix: "docs/en/docs/",
    endings: [".md"],
    skip: ["/release-notes.md", "docs/en/docs/_llm-test.md"],
    topic: "backend",
    parent: {
      slug: "fastapi",
      title: "FastAPI",
      goal:
        "Answer questions about FastAPI as documented today: path " +
        "operations and parameters, request and response models with " +
        "Pydantic, dependency injection, security and OAuth2 flows, " +
        "middleware and CORS, background tasks, WebSockets, testing with " +
        "TestClient, and deployment — with exact signatures and defaults.",
    },
    children: [
      {
        slug: "fastapi-tutorial",
        title: "FastAPI · Tutorial",
        goal:
          "Answer questions from the FastAPI tutorial: path and query " +
          "parameters with their validation options, request bodies and " +
          "response models, dependencies, security, middleware, static " +
          "files, testing and debugging — each with working code shapes.",
        areas: ["tutorial"],
      },
      {
        slug: "fastapi-advanced",
        title: "FastAPI · Advanced",
        goal:
          "Answer questions from the FastAPI advanced guide: advanced " +
          "dependency patterns, sub-applications and mounting, WebSockets, " +
          "lifespan events, custom request and APIRoute classes, and the " +
          "advanced security setups.",
        areas: ["advanced"],
      },
      {
        slug: "fastapi-deployment",
        title: "FastAPI · Deployment",
        goal:
          "Answer questions about deploying FastAPI as documented: server " +
          "options, HTTPS, Docker, behind a proxy, and the deployment " +
          "concepts pages.",
        areas: ["deployment"],
      },
      {
        slug: "fastapi-reference",
        title: "FastAPI · Reference",
        goal:
          "Answer questions about the FastAPI reference exactly as " +
          "specified: the FastAPI class and its parameters, APIRouter, " +
          "Request and Response classes, status codes and exceptions, and " +
          "every parameter class with its arguments.",
        areas: ["reference"],
      },
    ],
  },
  {
    // Pydantic v2 rewrote the validation API — validators, ConfigDict,
    // model methods — after models learned v1, so they answer in syntax
    // that no longer exists. Error codes and type coercion rules are
    // specified precisely enough that a paraphrase misleads.
    key: "pydantic",
    repo: "pydantic/pydantic",
    prefix: "docs/",
    endings: [".md"],
    topic: "backend",
    parent: {
      slug: "pydantic",
      title: "Pydantic",
      goal:
        "Answer questions about Pydantic as documented today: model " +
        "definition and field types, validation and serialization, " +
        "ConfigDict options, custom validators and serializers, JSON " +
        "Schema generation, settings management, the API reference, and " +
        "the validation error codes — v2 semantics, not v1.",
    },
    children: [
      {
        slug: "pydantic-concepts",
        title: "Pydantic · Concepts",
        goal:
          "Answer questions about the Pydantic concepts: models and their " +
          "config, fields and aliases, validators and serializers, " +
          "dataclasses, JSON Schema, strict mode, type adapters, and how " +
          "each standard and custom type is coerced.",
        areas: ["concepts"],
      },
      {
        slug: "pydantic-api",
        title: "Pydantic · API reference",
        goal:
          "Answer questions about the Pydantic API exactly as specified: " +
          "BaseModel and its methods, Field, ConfigDict, the decorators, " +
          "TypeAdapter and the rest — each with its signature and options.",
        areas: ["api"],
      },
      {
        slug: "pydantic-integrations",
        title: "Pydantic · Integrations",
        goal:
          "Answer how Pydantic integrates with the documented tools: " +
          "mypy, Hypothesis, devtools, datamodel-code-generator and the " +
          "rest, with the configuration each one needs.",
        areas: ["integrations"],
      },
    ],
  },
  {
    // Bun ships weekly and its API surface — Bun.serve, the bundler, the
    // test runner, bun pm — looks almost like Node's, which is exactly why
    // models improvise it wrong. snippets are include fragments, not pages.
    key: "bun",
    repo: "oven-sh/bun",
    prefix: "docs/",
    endings: [".md", ".mdx"],
    skip: ["docs/snippets"],
    topic: "backend",
    parent: {
      slug: "bun",
      title: "Bun",
      goal:
        "Answer questions about Bun as documented today: the runtime APIs " +
        "with their exact signatures, the bundler and its options, the " +
        "package manager commands, the test runner, Node.js compatibility " +
        "and its limits, and the guides — current behaviour, not Node " +
        "behaviour guessed by analogy.",
    },
    children: [
      {
        slug: "bun-runtime",
        title: "Bun · Runtime",
        goal:
          "Answer questions about the Bun runtime exactly as specified: " +
          "Bun.serve, Bun.file and file I/O, Bun.$ shell, SQLite, " +
          "WebSockets, TCP, transpiler and every other Bun.* API with its " +
          "arguments and options, plus Node compatibility details.",
        areas: ["runtime"],
      },
      {
        slug: "bun-bundler",
        title: "Bun · Bundler",
        goal:
          "Answer questions about the Bun bundler: Bun.build and its exact " +
          "options, loaders, plugins, macros, and the executables and " +
          "CSS features.",
        areas: ["bundler"],
      },
      {
        slug: "bun-pm",
        title: "Bun · Package manager",
        goal:
          "Answer questions about bun's package manager exactly as " +
          "specified: install, add, remove, update, link, publish, x and " +
          "the rest — each command's flags, workspaces, lockfile and " +
          "registry configuration.",
        areas: ["pm"],
      },
      {
        slug: "bun-test",
        title: "Bun · Test runner",
        goal:
          "Answer questions about the Bun test runner: writing tests, " +
          "the expect matchers, mocking, snapshots, coverage, and how it " +
          "differs from Jest where the docs say so.",
        areas: ["test"],
      },
    ],
  },
  {
    // The denoland/docs repo holds every Deno product at its root — the
    // prefix scopes strictly to the runtime manual, where the permission
    // flags and CLI options are specified precisely and training data
    // still mixes Deno 1 and Deno 2 idioms.
    key: "deno",
    repo: "denoland/docs",
    prefix: "runtime/",
    endings: [".md", ".mdx"],
    topic: "backend",
    parent: {
      slug: "deno",
      title: "Deno",
      goal:
        "Answer questions about the Deno runtime as documented today: " +
        "the permission model and its flags, the CLI commands and their " +
        "options, configuration with deno.json, Node and npm " +
        "compatibility, testing, linting and formatting, and the runtime " +
        "APIs — Deno 2 behaviour, not Deno 1.",
    },
    children: [
      {
        slug: "deno-fundamentals",
        title: "Deno · Fundamentals",
        goal:
          "Answer questions from the Deno fundamentals and getting-started " +
          "docs: the security and permission model, modules and imports, " +
          "the runtime Web APIs, workspaces, and running scripts with the " +
          "exact flags.",
        areas: ["fundamentals", "getting_started", "run"],
      },
      {
        slug: "deno-reference",
        title: "Deno · Reference",
        goal:
          "Answer questions from the Deno reference docs exactly as " +
          "specified: every CLI command with its flags, the deno.json " +
          "configuration fields, environment variables, and the runtime " +
          "API surface.",
        areas: ["reference"],
      },
    ],
  },
  {
    // Prisma Client's query API is a paraphrase trap — models invent
    // relation filters and nested writes that almost exist. The docs moved
    // into a monorepo app; the prefix scopes to the docs content and skips
    // the blog that sits beside it.
    key: "prisma",
    repo: "prisma/docs",
    prefix: "apps/docs/content/docs/",
    endings: [".mdx", ".md"],
    topic: "data",
    parent: {
      slug: "prisma",
      title: "Prisma",
      goal:
        "Answer questions about Prisma as documented today: the schema " +
        "language and its attributes, Prisma Client queries and their " +
        "exact options, relations and nested writes, migrations with " +
        "Prisma Migrate, the CLI commands, and the Prisma Postgres and " +
        "Accelerate products.",
    },
    children: [
      {
        slug: "prisma-orm",
        title: "Prisma · ORM",
        goal:
          "Answer questions about Prisma ORM exactly as specified: schema " +
          "models, fields and attributes, every Prisma Client method with " +
          "its arguments — findMany filters, relation queries, nested " +
          "writes, transactions — raw queries, and connecting to each " +
          "supported database.",
        areas: ["orm"],
      },
      {
        slug: "prisma-guides",
        title: "Prisma · Guides",
        goal:
          "Answer questions from the Prisma guides: framework integration " +
          "walkthroughs, deployment recipes, testing, seeding, and the " +
          "migration-from-other-tools guides.",
        areas: ["guides"],
      },
      {
        slug: "prisma-cli",
        title: "Prisma · CLI",
        goal:
          "Answer questions about the Prisma CLI exactly as specified: " +
          "every command — init, generate, migrate, db, studio, validate " +
          "and the rest — with its flags and environment variables.",
        areas: ["cli"],
      },
    ],
  },
  {
    // kubernetes/website is thousands of pages across locales and a
    // generated API reference; the prefix pins English and the skip keeps
    // out everything but concepts and tasks — the prose where behaviour is
    // specified precisely and where a model's memorised kubectl and API
    // versions are stalest.
    key: "kubernetes",
    repo: "kubernetes/website",
    prefix: "content/en/docs/",
    endings: [".md"],
    skip: [
      "content/en/docs/reference/",
      "content/en/docs/contribute/",
      "content/en/docs/doc-contributor-tools/",
      "content/en/docs/setup/",
      "content/en/docs/tutorials/",
      "content/en/docs/home/",
      "content/en/docs/test.md",
    ],
    topic: "devops",
    parent: {
      slug: "kubernetes",
      title: "Kubernetes",
      goal:
        "Answer questions about Kubernetes as documented today: the " +
        "concepts — workloads, services, networking, storage, " +
        "configuration, scheduling, security and cluster architecture — " +
        "and the task how-tos, with the resource kinds, field names and " +
        "kubectl invocations as the docs specify them.",
    },
    children: [
      {
        slug: "kubernetes-concepts",
        title: "Kubernetes · Concepts",
        goal:
          "Answer questions about Kubernetes concepts exactly as " +
          "documented: pods and every workload resource, services and " +
          "ingress, volumes and storage classes, ConfigMaps and Secrets, " +
          "scheduling and eviction, RBAC and security, networking and the " +
          "cluster architecture.",
        areas: ["concepts"],
      },
      {
        slug: "kubernetes-tasks",
        title: "Kubernetes · Tasks",
        goal:
          "Answer how to perform the documented Kubernetes tasks: " +
          "configuring pods and containers, running jobs, administering " +
          "clusters, managing TLS, extending the API, monitoring and " +
          "debugging — with the exact manifests and kubectl commands.",
        areas: ["tasks"],
      },
    ],
  },
  {
    // Godot 4 renamed half the engine from Godot 3, and models still
    // answer in 3.x API. classes/ is the generated API reference —
    // hundreds of pages that would drown the manual, which is where the
    // behaviour is actually specified. The repo is reStructuredText; the
    // ingest is an LLM, so .rst is fine.
    key: "godot",
    repo: "godotengine/godot-docs",
    prefix: "",
    endings: [".rst"],
    skip: ["classes/", "about/", "community/", "engine_details/", "404.rst"],
    topic: "gamedev",
    parent: {
      slug: "godot",
      title: "Godot Engine",
      goal:
        "Answer questions about the Godot engine as the current manual " +
        "documents it: the editor workflow, scenes and nodes, GDScript, " +
        "2D and 3D rendering, physics, animation, UI, input, audio, " +
        "exporting and best practices — Godot 4 APIs, not Godot 3.",
    },
    children: [
      {
        slug: "godot-getting-started",
        title: "Godot · Getting started",
        goal:
          "Answer questions from the Godot getting-started docs: the " +
          "introduction series, the step-by-step editor walkthrough, and " +
          "the first 2D and 3D game tutorials exactly as written.",
        areas: ["getting_started"],
      },
      {
        slug: "godot-tutorials",
        title: "Godot · Tutorials",
        goal:
          "Answer questions from the Godot tutorials: 2D and 3D features, " +
          "scripting with GDScript and C#, physics, animation, shaders, " +
          "UI, input, audio, navigation, networking, performance, plugins " +
          "and export — each with the node and API names the manual uses.",
        areas: ["tutorials"],
      },
    ],
  },
  {
    // LangChain's docs moved to langchain-ai/docs and the v1 agent API
    // replaced the chains API models memorised. python/ and javascript/
    // here are per-provider integration directories — hundreds of one-link
    // pages, the exact junk shape the seeder measured — so the pack keeps
    // the core langchain, langgraph and deepagents docs only.
    key: "langchain",
    repo: "langchain-ai/docs",
    prefix: "src/oss/",
    endings: [".mdx", ".md"],
    skip: [
      "src/oss/python/",
      "src/oss/javascript/",
      "src/oss/contributing/",
    ],
    topic: "ai",
    parent: {
      slug: "langchain",
      title: "LangChain & LangGraph",
      goal:
        "Answer questions about LangChain, LangGraph and Deep Agents as " +
        "documented today: the v1 agent abstraction, models and messages, " +
        "tools and structured output, LangGraph graphs with state, nodes " +
        "and edges, persistence and human-in-the-loop, and deployment — " +
        "the current API, not the 0.x chains API.",
    },
    children: [
      {
        slug: "langchain-core",
        title: "LangChain · Agents",
        goal:
          "Answer questions about LangChain as documented today: building " +
          "agents, model initialisation and message types, tool calling, " +
          "structured output, streaming, context engineering and the " +
          "middleware and retrieval patterns.",
        areas: ["langchain"],
      },
      {
        slug: "langgraph",
        title: "LangChain · LangGraph",
        goal:
          "Answer questions about LangGraph exactly as documented: " +
          "defining graphs with state, nodes and edges, persistence and " +
          "checkpointing, human-in-the-loop, memory, streaming, subgraphs " +
          "and deployment.",
        areas: ["langgraph"],
      },
      {
        slug: "deepagents",
        title: "LangChain · Deep Agents",
        goal:
          "Answer questions about Deep Agents as documented: creating an " +
          "agent, subagents, backends and filesystem tools, context " +
          "engineering, human-in-the-loop and customisation options.",
        areas: ["deepagents"],
      },
    ],
  },
  {
    // Better Auth shipped after most training cuts, so models improvise
    // its options, plugin config and adapter setup. The docs are precise
    // about all three — exactly the material a brain exists for.
    key: "better-auth",
    repo: "better-auth/better-auth",
    prefix: "docs/content/docs/",
    endings: [".mdx"],
    topic: "web",
    parent: {
      slug: "better-auth",
      title: "Better Auth",
      goal:
        "Answer questions about Better Auth as documented today: " +
        "installation and configuration, every authentication method and " +
        "its options, the plugin system, database adapters, client APIs " +
        "for each framework, and the reference — exact option names and " +
        "defaults, not invented ones.",
    },
    children: [
      {
        slug: "better-auth-authentication",
        title: "Better Auth · Authentication",
        goal:
          "Answer questions about Better Auth's authentication methods " +
          "exactly as documented: email and password, social sign-on and " +
          "each provider's setup, magic links, passkeys, two-factor, " +
          "sessions and account linking — with each method's options.",
        areas: ["authentication"],
      },
      {
        slug: "better-auth-plugins",
        title: "Better Auth · Plugins",
        goal:
          "Answer questions about Better Auth plugins exactly as " +
          "documented: every built-in plugin — organization, admin, " +
          "two-factor, passkey, magic-link and the rest — with its " +
          "configuration, schema additions and client methods.",
        areas: ["plugins"],
      },
      {
        slug: "better-auth-concepts",
        title: "Better Auth · Concepts",
        goal:
          "Answer questions about Better Auth's concepts: the database " +
          "schema, sessions, users and accounts, hooks, rate limiting, " +
          "email delivery and how the pieces fit together.",
        areas: ["concepts"],
      },
      {
        slug: "better-auth-reference",
        title: "Better Auth · Reference",
        goal:
          "Answer questions from the Better Auth reference: the options " +
          "object with every field and default, the API endpoints and " +
          "their payloads, error codes, and the CLI commands.",
        areas: ["reference"],
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
        !(pack.skip ?? []).some((s) => p.includes(s)) &&
        !JUNK.some((j) => j.test(p)),
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
