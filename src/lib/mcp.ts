import { query, maybeOne, one, tx, toVector } from "@/db";
import type { Brain, Note } from "@/db/types";
import { canWrite, type Access } from "@/lib/access";
import { chunksForNote, estimateTokens } from "@/lib/chunk";
import { embedPassages } from "@/lib/embed";
import { findDuplicateNote } from "@/lib/dedup";
import { scanSecrets } from "@/lib/scan";
import { searchBrain, briefBrain } from "@/lib/search";
import { normalizeCategory } from "@/lib/category";
import { clipExcerpt } from "@/lib/excerpt";
import { refreshNoteWeight } from "@/lib/note-weight";
import { familyScopeFor, accessibleChildren } from "@/lib/families";
import { slugify } from "@/lib/brains";
import { isTopic } from "@/lib/topics";
import { limitsFor } from "@/lib/plans";
import { captureServer } from "@/lib/analytics";
import { gateFor, hasPaid } from "@/lib/paywall";
import { checkFetchableUrl } from "@/lib/url-guard";
import { storage, storageKey } from "@/lib/storage";
import { enqueueIngest, enqueueCrawl, enqueueSummary } from "@/worker/queue";
import { summariesStale } from "@/worker/summary";
import type { TokenOwner } from "@/lib/tokens";

/**
 * The MCP tool surface.
 *
 * These descriptions are prompt engineering, not documentation — they decide
 * whether an agent reaches for the brain at all. Each one states *when* to call
 * it, not just what it does; a description that only describes gets ignored.
 */

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const TOOLS: ToolDef[] = [
  {
    name: "brain_list",
    description:
      "List the knowledge brains available to you. Call this once at the start " +
      "of a session, or whenever the user names a brain (e.g. \"use mozg:design\"). " +
      "Returns each brain's handle, what it is for, and how well it is trained.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "brain_brief",
    description:
      "Get a compact map of one brain: its goal, the categories of knowledge it " +
      "holds, and its known gaps. Cheap — call it before searching so you know " +
      "whether this brain can answer the question at all and which words it uses. " +
      "Do not skip this and guess at search terms.",
    inputSchema: {
      type: "object",
      properties: {
        brain: { type: "string", description: "Brain handle, e.g. \"design\"." },
      },
      required: ["brain"],
      additionalProperties: false,
    },
  },
  {
    name: "brain_search",
    description:
      "Search a brain for knowledge relevant to your current task. Call this " +
      "whenever the answer depends on project-specific conventions, layouts, " +
      "rules or decisions that are not already in this conversation — before " +
      "answering from general knowledge. Prefer several short, specific queries " +
      "over one long one. Returns ranked excerpts with note ids — excerpts are " +
      "cut short; brain_read gives the full note.",
    inputSchema: {
      type: "object",
      properties: {
        brain: { type: "string", description: "Brain handle." },
        query: { type: "string", description: "What you need to know." },
        limit: { type: "integer", description: "Max results, 1-25. Default 8." },
        category: {
          type: "string",
          description:
            "Optional category filter, e.g. \"typography/scale\". A top level " +
            "(\"typography\") also matches everything under it.",
        },
      },
      required: ["brain", "query"],
      additionalProperties: false,
    },
  },
  {
    name: "brain_read",
    description:
      "Read the full text of one note returned by brain_search, when the excerpt " +
      "is not enough to act on.",
    inputSchema: {
      type: "object",
      properties: {
        brain: { type: "string" },
        note_id: { type: "string", description: "id from a brain_search result." },
      },
      required: ["brain", "note_id"],
      additionalProperties: false,
    },
  },
  {
    name: "brain_write",
    description:
      "Save a durable lesson back into the brain: a convention you confirmed, a " +
      "correction to something the brain had wrong, a pitfall you hit. Write one " +
      "self-contained fact per call, phrased so it helps someone who was not in " +
      "this conversation. Do not save what the repository or this chat already " +
      "records, and never save credentials, tokens or personal data.",
    inputSchema: {
      type: "object",
      properties: {
        brain: { type: "string" },
        title: { type: "string", description: "Short and searchable." },
        body: { type: "string", description: "The fact, in full sentences." },
        kind: {
          type: "string",
          enum: ["fact", "rule", "layout", "example", "pitfall"],
        },
        category: { type: "string", description: "Reuse an existing category." },
      },
      required: ["brain", "title", "body"],
      additionalProperties: false,
    },
  },
  {
    name: "brain_feedback",
    description:
      "Report how a specific note held up in real use. Negative: the note is " +
      "wrong, outdated or misleading — after you verified it against reality " +
      "(the API answered differently, the docs changed, the code contradicts " +
      "it); the note keeps answering until its owner reviews the report. " +
      "Positive: the note proved correct and useful for your task. Both shift " +
      "how the note ranks in future searches. Say what you observed, not just " +
      "that you agree or disagree. Do not use this for notes that are merely " +
      "incomplete — brain_write a better one instead where you have write access.",
    inputSchema: {
      type: "object",
      properties: {
        brain: { type: "string", description: "Brain handle." },
        note_id: { type: "string", description: "id from a brain_search result." },
        useful: {
          type: "boolean",
          description:
            "true when the note proved correct and helped your task; false or " +
            "omitted reports it as wrong or outdated.",
        },
        reason: {
          type: "string",
          description:
            "What you observed — one or two sentences with the behaviour you " +
            "saw, good or bad.",
        },
      },
      required: ["brain", "note_id", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "brain_create",
    description:
      "Create a new brain. Use when the user asks to start one, or when you " +
      "notice they are explaining the same project-specific context repeatedly " +
      "and no existing brain covers it — offer first, do not create unasked. " +
      "The goal matters more than the name: it becomes an exam the brain is " +
      "scored against, so write it as an outcome (\"answer questions about our " +
      "webhook retries and idempotency\") rather than a subject (\"webhooks\"). " +
      "Creating the same title twice returns the existing brain instead of a " +
      "duplicate.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short name, e.g. \"Design system\"." },
        goal: {
          type: "string",
          description: "What it must be able to answer. Concrete; this becomes the exam.",
        },
        topic: {
          type: "string",
          description:
            "Catalogue field: web, backend, gamedev, mobile, ai, data, devops, " +
            "design, security, product, other.",
        },
        parent: {
          type: "string",
          description:
            "Handle of a brain to group this one under, for a large subject " +
            "split into parts (a docs site with an API, a maths model and an " +
            "SDK). Searching the parent then searches every child. One level " +
            "only — a child cannot have children.",
        },
        price_usd: {
          type: "number",
          description:
            "Sell this brain: a price in USD (0-1000) lists it publicly in " +
            "the catalogue at once — buyers pay once and keep access as it " +
            "updates. Only when the user explicitly wants to sell; omit " +
            "otherwise and the brain stays private.",
        },
      },
      required: ["title", "goal"],
      additionalProperties: false,
    },
  },
  {
    name: "brain_add_source",
    description:
      "Feed raw material into a brain: documentation pages by URL, or a block of " +
      "text. The material is read and turned into searchable notes in the " +
      "background — this returns as soon as the work is queued, so tell the user " +
      "it is processing rather than waiting for notes to appear. When the user " +
      "gives ONE link and means the whole documentation behind it (\"learn " +
      "https://example.com/docs\"), pass that single URL with crawl: true — " +
      "every page in that section is discovered and read, via the site's " +
      "sitemap, its GitHub repository, or by following links. Prefer this over " +
      "brain_write when you have primary material: brain_write saves one fact you " +
      "already know, this extracts many from a source. Never pass a URL behind a " +
      "login, and never paste text containing credentials.",
    inputSchema: {
      type: "object",
      properties: {
        brain: { type: "string", description: "Brain handle." },
        urls: {
          type: "array",
          items: { type: "string" },
          description: "Pages to read. Up to 25 per call.",
        },
        crawl: {
          type: "boolean",
          description:
            "With a single URL: discover and read the whole documentation " +
            "section behind it, not just that page. A GitHub repository URL " +
            "reads the doc files of the repository — for docs sites that are " +
            "JavaScript apps, the repository link is the one that works.",
        },
        text: { type: "string", description: "A block of material to read." },
        name: { type: "string", description: "What the text is, for the source list." },
      },
      required: ["brain"],
      additionalProperties: false,
    },
  },
];

// ─── resolution ──────────────────────────────────────────────────────────────

/**
 * The teaser: a paid brain answers this many queries per reader before it
 * asks to be bought. The product *is* the demo — a storefront can show exam
 * questions, but five real answers convert better than any copy. Counted from
 * the calls table, which billing already reads, so it survives reconnects.
 */
const TEASER_CALLS = 5;

interface Resolved {
  brain: Brain;
  access: Access;
  /** Set while a paid brain is being read on its free preview. */
  teaser?: { used: number; limit: number };
  /** Set when the preview is spent: render the offer, not the content. */
  locked?: boolean;
}

/** Accepts "design" (own brain) or "someone/design" (shared or public). */
async function resolveBrain(
  handle: string,
  userId: string,
): Promise<Resolved | null> {
  const [maybeOwner, maybeSlug] = handle.includes("/")
    ? handle.split("/", 2)
    : [null, handle];

  const brain = maybeOwner
    ? await maybeOne<Brain>(
        `select b.* from brains b join "user" u on u.id = b.owner_id
          where u.handle = $1 and b.slug = $2`,
        [maybeOwner, maybeSlug],
      )
    : await maybeOne<Brain>(`select * from brains where owner_id = $1 and slug = $2`, [
        userId,
        maybeSlug,
      ]);

  if (!brain) return null;

  if (brain.owner_id === userId) return { brain, access: "owner" };

  // Verified addresses only — see the note in lib/access.ts. An agent must not
  // be the way around a check the web app enforces.
  const grant = await maybeOne<{ role: "viewer" | "contributor" }>(
    `select g.role from grants g join "user" u on lower(u.email) = lower(g.email)
      where g.brain_id = $1 and u.id = $2 and u."emailVerified"`,
    [brain.id, userId],
  );
  if (grant) return { brain, access: grant.role };

  if (brain.visibility !== "public") return null;

  // A paid brain is not readable over MCP until it is bought, and a price on
  // a parent covers its children — except for the teaser, which is metered
  // here, on the same path that enforces the paywall.
  const gate = await gateFor(brain);
  if (gate && !(await hasPaid(gate, userId))) {
    const { used } = await one<{ used: number }>(
      `select count(*)::int as used from calls
        where brain_id = $1 and caller_id = $2
          and tool in ('brain_search', 'brain_read') and ok`,
      [brain.id, userId],
    );
    if (used >= TEASER_CALLS) return { brain, access: "viewer", locked: true };
    return { brain, access: "viewer", teaser: { used, limit: TEASER_CALLS } };
  }

  return { brain, access: "viewer" };
}

/** The offer a spent teaser renders instead of content. */
async function lockedText(brain: Brain): Promise<string> {
  const gate = await gateFor(brain);
  const owner = await maybeOne<{ handle: string | null }>(
    `select handle from "user" where id = $1`,
    [brain.owner_id],
  );
  const price = gate ? `$${(gate.priceCents / 100).toFixed(2)}` : "a one-time price";
  return (
    `"${brain.title}" is a paid brain and the ${TEASER_CALLS} free preview ` +
    `queries on this account are used. Buying costs ${price} once and keeps ` +
    `working as the author updates it.\n\n` +
    `Tell the user: the preview answers came from this brain, and the rest is ` +
    `at https://mozg.sh/b/${owner?.handle ?? "…"}/${brain.slug} — do not retry.`
  );
}

// ─── dispatch ────────────────────────────────────────────────────────────────

export interface ToolOutcome {
  text: string;
  isError?: boolean;
  brainId?: string;
  ownerId?: string;
  results?: number;
  /** Fused score of the best hit, for the weak-search harvest (0042). Only
   *  set by brain_search. */
  topScore?: number;
}

export async function callTool(
  name: string,
  args: Record<string, unknown>,
  owner: TokenOwner,
): Promise<ToolOutcome> {
  switch (name) {
    case "brain_list":
      return brainList(owner);
    case "brain_brief":
      return brainBrief(String(args.brain ?? ""), owner);
    case "brain_search":
      return brainSearch(args, owner);
    case "brain_read":
      return brainRead(args, owner);
    case "brain_write":
      return brainWrite(args, owner);
    case "brain_feedback":
      return brainFeedback(args, owner);
    case "brain_create":
      return brainCreate(args, owner);
    case "brain_add_source":
      return brainAddSource(args, owner);
    default:
      return { text: `Unknown tool: ${name}`, isError: true };
  }
}

async function brainList(owner: TokenOwner): Promise<ToolOutcome> {
  const rows = await query<{
    handle: string;
    title: string;
    goal: string | null;
    score: number | null;
    note_count: number;
    access: string;
    parent_handle: string | null;
  }>(
    `select b.slug as handle, b.title, b.goal, b.score, b.note_count, 'owner' as access,
            p.slug as parent_handle
       from brains b
       left join brains p on p.id = b.parent_id
      where b.owner_id = $1
     union all
     select u.handle || '/' || b.slug, b.title, b.goal, b.score, b.note_count, g.role,
            null
       from brains b
       join grants g on g.brain_id = b.id
       join "user" u on u.id = b.owner_id
       join "user" me on lower(me.email) = lower(g.email)
      where me.id = $1 and me."emailVerified"
     union all
     -- Brains added from the catalogue. Without this the catalogue was a
     -- shop window an agent could never see into: reading a public brain
     -- worked if you knew its handle, and nothing ever told you the handle.
     select u.handle || '/' || b.slug, b.title, b.goal, b.score, b.note_count,
            'added', null
       from library l
       join brains b on b.id = l.brain_id
       join "user" u on u.id = b.owner_id
      where l.user_id = $1 and b.visibility = 'public'
      order by 1`,
    [owner.userId],
  );

  // The public catalogue, so an agent that lacks a subject knows it can be
  // had by handle — headless sessions proved that without this an agent
  // concludes "no stake-engine brain exists" while one sits public.
  const shelf = new Set(rows.map((r) => r.handle));
  const catalogue = await query<{ handle: string; title: string; score: number | null; price_cents: number }>(
    `select u.handle || '/' || b.slug as handle, b.title, b.score, b.price_cents
       from brains b join "user" u on u.id = b.owner_id
      where b.visibility = 'public' and u.handle is not null and b.parent_id is null
        and b.note_count > 0
      order by b.score desc nulls last limit 12`,
  ).then((rs) => rs.filter((r) => !shelf.has(r.handle)));

  const catalogueBlock = catalogue.length
    ? "\n\nPublic catalogue — any of these work by handle right now " +
      "(e.g. brain_search {\"brain\": \"" + catalogue[0].handle + "\", ...}); " +
      "paid ones answer a few queries free:\n" +
      catalogue
        .map(
          (c) =>
            `- ${c.handle} — ${c.title}` +
            (c.score != null ? ` (trained ${c.score}%` : " (") +
            `${c.score != null && c.price_cents ? ", " : ""}${c.price_cents ? "paid" : c.score != null ? "" : "free"})`,
        )
        .join("\n") +
      "\nFull list: https://mozg.sh/explore"
    : "";

  if (!rows.length) {
    return {
      text:
        "No brains on your shelf yet. Create one with brain_create and feed " +
        "it with brain_add_source — or use a public brain below directly." +
        catalogueBlock,
    };
  }

  const describe = (r: (typeof rows)[number], indent: string) =>
    `${indent}- ${r.handle} — ${r.title}\n` +
    `${indent}  goal: ${r.goal ?? "not set"}\n` +
    `${indent}  ${r.note_count} notes · ` +
    `${r.score === null ? "not examined" : `trained ${r.score}%`} · ${r.access}`;

  // Children are printed under their parent so the shape of someone's
  // knowledge is visible at a glance, and so an agent knows that asking the
  // parent covers all of them.
  const children = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.parent_handle) continue;
    children.set(r.parent_handle, [...(children.get(r.parent_handle) ?? []), r]);
  }

  const lines: string[] = [];
  for (const r of rows) {
    if (r.parent_handle) continue;
    lines.push(describe(r, ""));
    const kids = children.get(r.handle) ?? [];
    if (kids.length) {
      lines.push(
        `    searching ${r.handle} searches these ${kids.length} together; ` +
          "ask a child directly to stay inside one subject:",
      );
      for (const kid of kids) lines.push(describe(kid, "    "));
    }
  }

  return {
    text: `${rows.length} brain(s) available:\n\n${lines.join("\n")}${catalogueBlock}`,
  };
}

async function brainBrief(handle: string, owner: TokenOwner): Promise<ToolOutcome> {
  const resolved = await resolveBrain(handle, owner.userId);
  if (!resolved) return notFound(handle);

  const brief = await briefBrain(resolved.brain.id);

  // Lazy summary compilation, same pattern as lessons on the study page: the
  // brief notices the brain outgrew its summaries and queues a recompile, so
  // the NEXT brief leads with them. Fire-and-forget — the answer below is
  // complete without them.
  if (await summariesStale(resolved.brain.id)) {
    void enqueueSummary(resolved.brain.id).catch(() => {});
  }

  const parts = [
    `Brain: ${resolved.brain.title} (${handle})`,
    `Goal: ${brief.goal ?? "not set"}`,
    `${brief.noteCount} notes.`,
  ];

  // Summaries first: the synthesised "what it knows" per category is the
  // fastest orientation the brain can offer, before the raw category tree
  // and long before search. Not searchable themselves by design (0041) —
  // they restate the notes, so indexing them would only fuzz up retrieval.
  if (brief.summaries.length) {
    parts.push(
      "",
      "What it knows, per category:",
      ...brief.summaries.map((s) => `  ${s.category}: ${s.body}`),
    );
  }

  // A parent is a map, not a store. Say what it groups before anything else —
  // an agent that reads this should know it can search here for everything, or
  // pick one child to stay inside a single subject. Only the children this
  // caller may read: naming a private one would leak that it exists at all.
  const kids = resolved.brain.parent_id
    ? []
    : await accessibleChildren(resolved.brain.id, owner.userId);
  if (kids.length) {
    parts.push(
      "",
      `This brain groups ${kids.length} others. Searching it searches all of them;`,
      "name a child to stay inside one subject:",
      ...kids.map(
        (k) =>
          `  ${k.slug} — ${k.title}` +
          `\n      ${k.goal ?? "no goal set"}` +
          `\n      ${k.note_count} notes · ${k.score === null ? "not examined" : `trained ${k.score}%`}`,
      ),
    );
  }

  // Rendered as a tree: the top level carries the group's total, its children
  // list their own counts. Capped in briefBrain — when it had to trim, say so,
  // or the agent reads a summary as the whole map.
  const categoryLines = brief.categories.map((c) => {
    const kids = c.children
      // Just the part after the top level — the filter takes the full path,
      // and the hint below says how to compose it.
      .map((k) => `${k.name.slice(c.name.length + 1)} (${k.notes})`)
      .join(", ");
    const more = c.hiddenChildren ? `, +${c.hiddenChildren} more` : "";
    return `  ${c.name} — ${c.notes} notes` + (kids ? `: ${kids}${more}` : "");
  });
  parts.push(
    "",
    "Categories (pass one to brain_search's category filter, as \"top/sub\";",
    "a top level alone covers everything under it):",
    ...categoryLines,
  );
  if (brief.hiddenCategories > 0) {
    parts.push(
      `  … ${brief.hiddenCategories} more top-level categories not shown —`,
      "  this is the largest slice; search with a category filter to drill further.",
    );
  }

  if (brief.sampleTitles.length) {
    parts.push("", "Recent notes:", ...brief.sampleTitles.map((t) => `  · ${t}`));
  }
  if (brief.knownGaps.length) {
    parts.push(
      "",
      "Known gaps — the brain currently fails every check in these areas, so do",
      "not trust it here; say so instead of guessing:",
      ...brief.knownGaps.map((g) => `  ✕ ${g}`),
    );
  }

  return {
    text: parts.join("\n"),
    brainId: resolved.brain.id,
    ownerId: resolved.brain.owner_id,
  };
}

async function brainSearch(
  args: Record<string, unknown>,
  owner: TokenOwner,
): Promise<ToolOutcome> {
  const handle = String(args.brain ?? "");
  const q = String(args.query ?? "");
  const resolved = await resolveBrain(handle, owner.userId);
  if (!resolved) return notFound(handle);
  if (resolved.locked) {
    return {
      text: await lockedText(resolved.brain),
      isError: true,
      brainId: resolved.brain.id,
      ownerId: resolved.brain.owner_id,
      results: 0,
    };
  }

  // A parent reaches the children this caller may read — no further. Resolving
  // the parent checked the parent's gate only, so an unfiltered scope would
  // let a public parent answer from its private or unpurchased children.
  const scope = await familyScopeFor(resolved.brain, owner.userId);

  const { hits, degraded, reranked } = await searchBrain(scope, q, {
    limit: typeof args.limit === "number" ? args.limit : undefined,
    category: typeof args.category === "string" ? args.category : null,
  });

  if (!hits.length) {
    return {
      text:
        `No matches in "${resolved.brain.title}" for: ${q}\n\n` +
        "Call brain_brief to see which categories it does cover, or answer from " +
        "your own knowledge and say the brain had nothing on this.",
      brainId: resolved.brain.id,
      ownerId: resolved.brain.owner_id,
      results: 0,
    };
  }

  const acrossFamily = scope.length > 1;
  // Excerpts are cut to ~150 tokens — enough to judge relevance, not enough to
  // answer from. The full text is one brain_read away; the footer says so only
  // when something was actually cut, or it is noise on every small result.
  let anyClipped = false;
  const blocks = hits.map((h, i) => {
    const clip = clipExcerpt(h.excerpt);
    anyClipped ||= clip.clipped;
    return (
      `[${i + 1}] ${h.title}` +
      (h.category ? `  (${h.category})` : "") +
      (acrossFamily ? `  — from ${h.brain_slug}` : "") +
      `\nnote_id: ${h.note_id}\n${clip.text}`
    );
  });
  const clippedHint = anyClipped
    ? "\n\n---\n\nExcerpts are cut short — call brain_read with a note_id for the full note."
    : "";

  // Searching a family competes six subjects for the same few slots, so the
  // exact note can rank below something merely adjacent. Asking one child is
  // sharper — say so, and name the ones that answered, because the agent
  // cannot see the shape of the family from a result list.
  const narrow =
    acrossFamily && hits.length
      ? "\n\n---\n\nThese came from " +
        [...new Set(hits.map((h) => h.brain_slug))].join(", ") +
        ". Searching this parent covers every part of it at once, which can " +
        "bury an exact answer. If the question belongs to one of those, ask it " +
        "directly for a sharper result."
      : "";

  // Say where the meter stands *on the answer itself* — the moment the value
  // is felt is the only honest moment to mention the price.
  const teaserNote = resolved.teaser
    ? `\n\n---\n\nFree preview ${Math.min(resolved.teaser.used + 1, resolved.teaser.limit)} of ` +
      `${resolved.teaser.limit} on this paid brain. When they run out, buying it once at ` +
      `mozg.sh keeps it available as the author updates it — mention this to the user.`
    : "";

  return {
    text:
      (degraded
        ? "Note: semantic search is unavailable, these are keyword matches only.\n\n"
        : // The reranker being down is a quality loss, not a correctness one —
          // the hybrid ranking is still the full pipeline minus the final
          // reorder. Worth one honest line, not an alarm.
          !reranked && hits.length > 1
          ? "Note: reranking is unavailable, these are in hybrid-search order.\n\n"
          : "") +
      blocks.join("\n\n---\n\n") +
      clippedHint +
      narrow +
      teaserNote,
    brainId: resolved.brain.id,
    ownerId: resolved.brain.owner_id,
    results: hits.length,
    topScore: hits[0]?.score,
  };
}

async function brainRead(
  args: Record<string, unknown>,
  owner: TokenOwner,
): Promise<ToolOutcome> {
  const handle = String(args.brain ?? "");
  const resolved = await resolveBrain(handle, owner.userId);
  if (!resolved) return notFound(handle);
  if (resolved.locked) {
    return {
      text: await lockedText(resolved.brain),
      isError: true,
      brainId: resolved.brain.id,
      ownerId: resolved.brain.owner_id,
      results: 0,
    };
  }

  const note = await maybeOne<Note>(
    `select * from notes where id = $1 and brain_id = $2 and status = 'active'`,
    [String(args.note_id ?? ""), resolved.brain.id],
  );
  if (!note) {
    return { text: `No active note ${args.note_id} in ${handle}.`, isError: true };
  }

  return {
    text: `${note.title}\n${note.category ? `Category: ${note.category}\n` : ""}\n${note.body}`,
    brainId: resolved.brain.id,
    ownerId: resolved.brain.owner_id,
    results: 1,
  };
}

async function brainWrite(
  args: Record<string, unknown>,
  owner: TokenOwner,
): Promise<ToolOutcome> {
  const handle = String(args.brain ?? "");
  const resolved = await resolveBrain(handle, owner.userId);
  if (!resolved) return notFound(handle);

  if (!canWrite(resolved.access)) {
    return {
      text: `You have read-only access to ${handle}.`,
      isError: true,
    };
  }

  // The plan page says agents can write back on Pro. It said so while nothing
  // enforced it, which made the sentence a decoration rather than a rule.
  if (!limitsFor(owner.plan).write) {
    return {
      text:
        `Writing back is a Pro feature and this account is on ${owner.plan}. ` +
        "Tell the user what you would have saved and that they can turn it on " +
        "at mozg.sh/settings — do not retry.",
      isError: true,
    };
  }

  // Capped like brain_create does (80/4000), only looser — a note is longer
  // than a goal, but an agent pasting a whole log file should be stopped
  // somewhere. 200/20000 matches what a human would ever write by hand.
  const title = String(args.title ?? "").trim().slice(0, 200);
  const body = String(args.body ?? "").trim().slice(0, 20000);
  if (!title || !body) {
    return { text: "Both title and body are required.", isError: true };
  }

  // Same gate as ingest. An agent paraphrasing a token into a "lesson" is a
  // real failure mode, and this is the path with no human in the loop.
  const findings = scanSecrets(`${title}\n${body}`);
  if (findings.length) {
    return {
      text:
        "Rejected: this looks like it contains a credential " +
        `(${findings.map((f) => f.label).join(", ")}). Rewrite it without the secret.`,
      isError: true,
    };
  }

  const pending = resolved.brain.review_required;
  const texts = chunksForNote(title, body);

  // The duplicate check needs the note's vector, so the embed moved ahead of
  // the insert: a failed embed now leaves nothing behind at all, where it used
  // to strand a pending row (the ghost note review.approve's comment warns
  // about).
  //
  // On the review path the embed only feeds the duplicate check — the note
  // itself is embedded on approval, and failing the whole write because a
  // local check could not run would be the tail wagging the dog. The reviewer
  // is the dedup backstop there.
  let vectors: number[][] | null = null;
  try {
    vectors = await embedPassages(texts);
  } catch (err) {
    if (!pending) throw err;
  }

  // Same threshold as ingest (lib/dedup.ts): an agent re-writing a fact the
  // brain already holds is the most common duplicate there is, and until now
  // this path never checked.
  const duplicate = vectors?.length
    ? await findDuplicateNote(resolved.brain.id, vectors[0])
    : null;

  // Without review, refuse outright and say what the brain already has. The
  // agent can then brain_read the existing note and write again with the
  // specific difference stated — an update, not a copy.
  if (duplicate && !pending) {
    return {
      text:
        `Not saved — ${handle} already holds this as "${duplicate.title}" ` +
        `(note_id: ${duplicate.note_id}).\n\n` +
        "Call brain_read on it. If your lesson adds something it lacks, write " +
        "again stating that specific difference or extra detail; do not retry " +
        "the same wording.",
      isError: true,
      brainId: resolved.brain.id,
      ownerId: resolved.brain.owner_id,
      results: 0,
    };
  }

  // With review, save anyway and flag the look-alike in the response: pending
  // is the human's territory, and silently refusing could swallow a deliberate
  // correction to the note it resembles. The reviewer sees both and decides.
  const note = await one<{ id: string }>(
    `insert into notes
       (brain_id, title, body, category, kind, author, agent_client, status, confidence)
     values ($1, $2, $3, $4, $5, 'agent', $6, 'pending', 0.7)
     returning id`,
    [
      resolved.brain.id,
      title,
      body,
      // Same canonicalisation ingest applies — an agent writing "Type Scale"
      // must land in the same category as extraction's "type scale".
      normalizeCategory(typeof args.category === "string" ? args.category : null),
      typeof args.kind === "string" ? args.kind : "fact",
      "mcp",
    ],
  );

  // Pending notes stay unindexed until approved — otherwise "review required"
  // would be theatre and unapproved notes would already be answering queries.
  if (!pending) {
    await tx(async (client) => {
      for (let i = 0; i < texts.length; i++) {
        await client.query(
          `insert into chunks (brain_id, note_id, content, token_count, embedding)
           values ($1, $2, $3, $4, $5::vector)`,
          [
            resolved.brain.id,
            note.id,
            texts[i],
            estimateTokens(texts[i]),
            toVector(vectors![i]),
          ],
        );
      }
      // Flipped active in the same transaction as the chunks that make it
      // searchable — an "active" note with no chunks is invisible to search,
      // which looks like the write silently did nothing.
      await client.query(`update notes set status = 'active' where id = $1`, [note.id]);
    });
  }

  if (!pending) {
    await query(`update brains set content_changed_at = now() where id = $1`, [
      resolved.brain.id,
    ]);
  }

  return {
    text: pending
      ? `Saved to ${handle} and queued for the owner's review. It will not appear ` +
        "in search until approved." +
        (duplicate
          ? `\n\nHeads-up: it looks very close to the existing note ` +
            `"${duplicate.title}" (note_id: ${duplicate.note_id}). The reviewer ` +
            "sees both and decides — but if this was meant as a correction, " +
            "brain_read that note and write again stating what it gets wrong."
          : "")
      : `Saved to ${handle}. It is searchable now.`,
    brainId: resolved.brain.id,
    ownerId: resolved.brain.owner_id,
    results: 1,
  };
}

/**
 * An agent reports a note as wrong. Any reader may flag — a viewer of a
 * bought brain caught the bug in production, and that is exactly the reader
 * whose report matters. Idempotent per reader+note via the unique constraint.
 */
async function brainFeedback(
  args: Record<string, unknown>,
  owner: TokenOwner,
): Promise<ToolOutcome> {
  const handle = String(args.brain ?? "");
  const resolved = await resolveBrain(handle, owner.userId);
  if (!resolved) return notFound(handle);

  const reason = String(args.reason ?? "").trim().slice(0, 1000);
  if (!reason) {
    return { text: "Say what you observed — an empty report helps nobody.", isError: true };
  }

  const note = await maybeOne<{ id: string; title: string }>(
    `select id, title from notes where id = $1 and brain_id = $2 and status = 'active'`,
    [String(args.note_id ?? ""), resolved.brain.id],
  );
  if (!note) {
    return { text: `No active note ${args.note_id} in ${handle}.`, isError: true };
  }

  const useful = args.useful === true;
  const signal = useful ? "up" : "down";

  await query(
    `insert into note_flags (brain_id, note_id, caller_id, reason, signal)
     values ($1, $2, $3, $4, $5)
     on conflict (note_id, caller_id) do update
       set reason = $4, signal = $5, created_at = now()`,
    [resolved.brain.id, note.id, owner.userId, reason, signal],
  );

  // The stored weight is a cache of the flags; writing a flag without
  // refreshing it would leave search ranking on yesterday's verdict.
  await refreshNoteWeight(note.id);

  return {
    text: useful
      ? `Noted — "${note.title}" held up in real use. It will rank a little ` +
        "higher for the next agent."
      : `Reported "${note.title}" to the owner of ${handle}. The note keeps ` +
        "answering until they review it — if your task needs the corrected fact " +
        "now, state it to the user directly rather than re-searching.",
    brainId: resolved.brain.id,
    ownerId: resolved.brain.owner_id,
    results: 1,
  };
}

/**
 * Create a brain from an agent. Same limits as the web form, because a quota
 * that only one path enforces is not a quota.
 *
 * Idempotent on the slug: an agent that retries after a timeout, or a user who
 * asks twice in one session, gets the brain back rather than a second copy
 * with a "-2" suffix that nothing will ever look at again.
 */
async function brainCreate(
  args: Record<string, unknown>,
  owner: TokenOwner,
): Promise<ToolOutcome> {
  const title = String(args.title ?? "").trim().slice(0, 80);
  const goal = String(args.goal ?? "").trim().slice(0, 4000);

  if (!title) return { text: "A title is required.", isError: true };
  if (!goal) {
    return {
      text:
        "A goal is required — it becomes the exam this brain is scored against. " +
        "Write what it must be able to answer, as an outcome rather than a subject.",
      isError: true,
    };
  }

  const slug = slugify(title);
  const existing = await maybeOne<Brain>(
    `select * from brains where owner_id = $1 and slug = $2`,
    [owner.userId, slug],
  );
  if (existing) {
    return {
      text:
        `A brain "${existing.slug}" already exists with that name — returning it ` +
        `instead of creating a duplicate. Its goal is: ${existing.goal ?? "not set"}. ` +
        "Add material with brain_add_source, or pick a different title.",
      brainId: existing.id,
      ownerId: existing.owner_id,
    };
  }

  const limits = limitsFor(owner.plan);
  const { count } = await one<{ count: number }>(
    `select count(*)::int as count from brains where owner_id = $1`,
    [owner.userId],
  );
  if (count >= limits.brains) {
    return {
      text:
        limits.brains === 0
          ? "Building brains is a Pro feature — this account's free plan reads, " +
            "buys and connects. Tell the user to upgrade at mozg.sh/pricing; " +
            "do not retry."
          : `The ${owner.plan} plan holds ${limits.brains} brain${limits.brains === 1 ? "" : "s"} ` +
            `and ${count} already exist. Tell the user to upgrade at mozg.sh/settings, ` +
            "or to reuse an existing brain.",
      isError: true,
    };
  }

  const topic = isTopic(args.topic) ? String(args.topic) : "other";

  // Same bounds and rule as the web form: a price means public, at once.
  const priceUsd = typeof args.price_usd === "number" ? args.price_usd : 0;
  if (priceUsd < 0 || priceUsd > 1000) {
    return { text: "price_usd must be between 0 and 1000.", isError: true };
  }
  const priceCents = Math.round(priceUsd * 100);

  // A parent has to exist, belong to this user, and not be a child itself. The
  // database enforces all three; resolving here turns a constraint violation
  // into a sentence the agent can act on.
  let parentId: string | null = null;
  const parentHandle = String(args.parent ?? "").trim();
  if (parentHandle) {
    const parent = await maybeOne<Brain>(
      `select * from brains where owner_id = $1 and slug = $2`,
      [owner.userId, parentHandle],
    );
    if (!parent) {
      return {
        text: `No brain "${parentHandle}" to group this under. Call brain_list.`,
        isError: true,
      };
    }
    if (parent.parent_id) {
      return {
        text:
          `"${parentHandle}" is itself grouped under another brain, and brains ` +
          "nest one level deep. Group this under its parent instead.",
        isError: true,
      };
    }
    parentId = parent.id;
  }

  const brain = await one<Brain>(
    `insert into brains (owner_id, slug, title, goal, topic, parent_id, visibility, price_cents)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
    [
      owner.userId,
      slug,
      title,
      goal,
      topic,
      parentId,
      priceCents > 0 ? "public" : "private",
      priceCents,
    ],
  );

  // Same activation event as the web form — the first brain, by any door.
  if (count === 0) {
    captureServer(owner.userId, "first_brain_created", { brain_id: brain.id, via: "mcp" });
  }

  return {
    text:
      `Created "${brain.title}" with the handle ${brain.slug}` +
      (parentHandle ? `, grouped under ${parentHandle}` : "") +
      (priceCents > 0
        ? ` — public in the catalogue at $${(priceCents / 100).toFixed(2)}`
        : "") +
      ".\n\n" +
      `Goal: ${goal}\n\n` +
      "It is empty. Add material with brain_add_source — documentation pages by " +
      "URL, or blocks of text. Once material is in, it sits an exam built from " +
      "the goal and reports which categories it cannot answer yet; that list is " +
      "what to add next. The owner can also upload screenshots and PDFs at " +
      `mozg.sh/brains/${brain.slug}.`,
    brainId: brain.id,
    ownerId: brain.owner_id,
    results: 1,
  };
}

/**
 * Feed material in. Owner only — ingest spends the owner's extraction budget,
 * and the web upload path is owner-only too.
 */
async function brainAddSource(
  args: Record<string, unknown>,
  owner: TokenOwner,
): Promise<ToolOutcome> {
  const handle = String(args.brain ?? "");
  const resolved = await resolveBrain(handle, owner.userId);
  if (!resolved) return notFound(handle);
  if (resolved.access !== "owner") {
    return {
      text: `Only the owner of ${handle} can add material to it.`,
      isError: true,
    };
  }
  const brain = resolved.brain;

  const rawUrls = Array.isArray(args.urls)
    ? args.urls.map((u) => String(u).trim()).filter(Boolean).slice(0, 25)
    : [];

  // One link, the whole site behind it. The site row is a crawl root the
  // worker expands into ordinary url sources; the plan's source cap is
  // enforced there, where the page count is actually known.
  if (args.crawl === true) {
    if (rawUrls.length !== 1) {
      return {
        text:
          "crawl: true takes exactly one URL — the root of the documentation " +
          "to learn. Pass several URLs without crawl to read specific pages.",
        isError: true,
      };
    }
    const check = await checkFetchableUrl(rawUrls[0]);
    if (!check.ok || !check.url) {
      return { text: `Refused ${rawUrls[0].slice(0, 60)} — ${check.reason}`, isError: true };
    }
    const limits = limitsFor(owner.plan);
    if (brain.source_count + 1 > limits.sources) {
      return {
        text:
          `That would exceed ${limits.sources} sources on the ${owner.plan} plan ` +
          `(${brain.source_count} used). Tell the user to upgrade at mozg.sh/settings.`,
        isError: true,
      };
    }
    const site = await one<{ id: string }>(
      `insert into sources (brain_id, kind, url, original_name)
       values ($1, 'site', $2, $3) returning id`,
      [brain.id, check.url, `${new URL(check.url).hostname} (whole site)`],
    );
    await enqueueCrawl(site.id);
    return {
      text:
        `Queued a crawl of ${check.url} for ${handle}. Pages are discovered ` +
        "and read in the background — the source list on " +
        `mozg.sh/brains/${brain.slug} shows each page as it is found, and the ` +
        "exam re-runs by itself as material lands. This takes minutes, not " +
        "seconds; tell the user it is learning rather than polling for notes.",
      brainId: brain.id,
      ownerId: brain.owner_id,
      results: 1,
    };
  }
  // ~100 KB of pasted material: the web upload path caps files at 20 MB, but
  // a text block goes through extraction as one job, so a smaller cap keeps a
  // paste from turning into a very expensive single ingest.
  const text = typeof args.text === "string" ? args.text.trim().slice(0, 100_000) : "";

  if (!rawUrls.length && !text) {
    return { text: "Pass urls, text, or both.", isError: true };
  }

  const limits = limitsFor(owner.plan);
  const wanted = rawUrls.length + (text ? 1 : 0);
  if (brain.source_count + wanted > limits.sources) {
    return {
      text:
        `That would exceed ${limits.sources} sources on the ${owner.plan} plan ` +
        `(${brain.source_count} used). Tell the user to upgrade at mozg.sh/settings.`,
      isError: true,
    };
  }

  const added: string[] = [];
  const refused: string[] = [];

  for (const raw of rawUrls) {
    // The same SSRF guard the web form uses: resolves DNS and rejects private,
    // loopback and metadata addresses. An agent is a fine way to be pointed at
    // 169.254.169.254 by a poisoned page.
    const check = await checkFetchableUrl(raw);
    if (!check.ok || !check.url) {
      refused.push(`${raw.slice(0, 60)} — ${check.reason}`);
      continue;
    }
    const source = await one<{ id: string }>(
      `insert into sources (brain_id, kind, url, original_name)
       values ($1, 'url', $2, $3) returning id`,
      [brain.id, check.url, new URL(check.url).hostname],
    );
    await enqueueIngest(source.id);
    added.push(check.url);
  }

  if (text) {
    // Same gate as brain_write. This is a path with no human looking at the
    // material before it is stored.
    const findings = scanSecrets(text);
    if (findings.length) {
      refused.push(
        `the text block — it contains what looks like a credential ` +
          `(${findings.map((f) => f.label).join(", ")})`,
      );
    } else {
      const name = String(args.name ?? "").trim().slice(0, 120) || "pasted by an agent";
      const key = storageKey(brain.id, `${name}.md`);
      await storage.put(key, Buffer.from(text, "utf8"), "text/markdown");
      const source = await one<{ id: string }>(
        `insert into sources (brain_id, kind, storage_key, original_name, mime, bytes)
         values ($1, 'text', $2, $3, 'text/markdown', $4) returning id`,
        [brain.id, key, name, Buffer.byteLength(text, "utf8")],
      );
      await enqueueIngest(source.id);
      added.push(name);
    }
  }

  if (!added.length) {
    return {
      text: `Nothing was added.\n${refused.map((r) => `- ${r}`).join("\n")}`,
      isError: true,
      brainId: brain.id,
      ownerId: brain.owner_id,
    };
  }

  return {
    text:
      `Queued ${added.length} source${added.length === 1 ? "" : "s"} for ${handle}: ` +
      `${added.slice(0, 8).join(", ")}${added.length > 8 ? ", …" : ""}.\n\n` +
      "Reading happens in the background — notes will not be searchable for a " +
      "minute or two. Do not call brain_search expecting them immediately; tell " +
      "the user it is processing." +
      (refused.length
        ? `\n\nRefused:\n${refused.map((r) => `- ${r}`).join("\n")}`
        : ""),
    brainId: brain.id,
    ownerId: brain.owner_id,
    results: added.length,
  };
}

function notFound(handle: string): ToolOutcome {
  return {
    text:
      `No brain "${handle}" is available to you. Call brain_list to see what is.`,
    isError: true,
  };
}
