import { query, maybeOne, one, toVector } from "@/db";
import type { Brain, Note } from "@/db/types";
import { canWrite, type Access } from "@/lib/access";
import { chunksForNote, estimateTokens } from "@/lib/chunk";
import { embedPassages } from "@/lib/embed";
import { scanSecrets } from "@/lib/scan";
import { searchBrain, briefBrain } from "@/lib/search";
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
      "over one long one. Returns ranked excerpts with note ids.",
    inputSchema: {
      type: "object",
      properties: {
        brain: { type: "string", description: "Brain handle." },
        query: { type: "string", description: "What you need to know." },
        limit: { type: "integer", description: "Max results, 1-25. Default 8." },
        category: { type: "string", description: "Optional category filter." },
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
];

// ─── resolution ──────────────────────────────────────────────────────────────

/** Accepts "design" (own brain) or "someone/design" (shared or public). */
async function resolveBrain(
  handle: string,
  userId: string,
): Promise<{ brain: Brain; access: Access } | null> {
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

  // A paid brain is not readable over MCP until it is bought. The agent path
  // must not be a way around the paywall the site enforces.
  if (brain.price_cents > 0) {
    const bought = await maybeOne(
      `select 1 from purchases where brain_id = $1 and buyer_id = $2`,
      [brain.id, userId],
    );
    if (!bought) return null;
  }

  return { brain, access: "viewer" };
}

// ─── dispatch ────────────────────────────────────────────────────────────────

export interface ToolOutcome {
  text: string;
  isError?: boolean;
  brainId?: string;
  ownerId?: string;
  results?: number;
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
  }>(
    `select b.slug as handle, b.title, b.goal, b.score, b.note_count, 'owner' as access
       from brains b where b.owner_id = $1
     union all
     select u.handle || '/' || b.slug, b.title, b.goal, b.score, b.note_count, g.role
       from brains b
       join grants g on g.brain_id = b.id
       join "user" u on u.id = b.owner_id
       join "user" me on lower(me.email) = lower(g.email)
      where me.id = $1 and me."emailVerified"
      order by 1`,
    [owner.userId],
  );

  if (!rows.length) {
    return {
      text:
        "No brains yet. Create one at the mozg dashboard, add sources, then " +
        "call brain_list again.",
    };
  }

  const lines = rows.map(
    (r) =>
      `- ${r.handle} — ${r.title}\n` +
      `  goal: ${r.goal ?? "not set"}\n` +
      `  ${r.note_count} notes · ${r.score === null ? "not examined" : `trained ${r.score}%`} · ${r.access}`,
  );
  return { text: `${rows.length} brain(s) available:\n\n${lines.join("\n")}` };
}

async function brainBrief(handle: string, owner: TokenOwner): Promise<ToolOutcome> {
  const resolved = await resolveBrain(handle, owner.userId);
  if (!resolved) return notFound(handle);

  const brief = await briefBrain(resolved.brain.id);
  const parts = [
    `Brain: ${resolved.brain.title} (${handle})`,
    `Goal: ${brief.goal ?? "not set"}`,
    `${brief.noteCount} notes.`,
    "",
    "Categories:",
    ...brief.categories.map((c) => `  ${c.name} — ${c.notes} notes`),
  ];

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

  const { hits, degraded } = await searchBrain(resolved.brain.id, q, {
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

  const blocks = hits.map(
    (h, i) =>
      `[${i + 1}] ${h.title}` +
      (h.category ? `  (${h.category})` : "") +
      `\nnote_id: ${h.note_id}\n${h.excerpt}`,
  );

  return {
    text:
      (degraded
        ? "Note: semantic search is unavailable, these are keyword matches only.\n\n"
        : "") + blocks.join("\n\n---\n\n"),
    brainId: resolved.brain.id,
    ownerId: resolved.brain.owner_id,
    results: hits.length,
  };
}

async function brainRead(
  args: Record<string, unknown>,
  owner: TokenOwner,
): Promise<ToolOutcome> {
  const handle = String(args.brain ?? "");
  const resolved = await resolveBrain(handle, owner.userId);
  if (!resolved) return notFound(handle);

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

  const title = String(args.title ?? "").trim();
  const body = String(args.body ?? "").trim();
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
  const note = await one<{ id: string }>(
    `insert into notes
       (brain_id, title, body, category, kind, author, agent_client, status, confidence)
     values ($1, $2, $3, $4, $5, 'agent', $6, $7, 0.7)
     returning id`,
    [
      resolved.brain.id,
      title,
      body,
      typeof args.category === "string" ? args.category : null,
      typeof args.kind === "string" ? args.kind : "fact",
      "mcp",
      pending ? "pending" : "active",
    ],
  );

  // Pending notes stay unindexed until approved — otherwise "review required"
  // would be theatre and unapproved notes would already be answering queries.
  if (!pending) {
    const texts = chunksForNote(title, body);
    const vectors = await embedPassages(texts);
    for (let i = 0; i < texts.length; i++) {
      await query(
        `insert into chunks (brain_id, note_id, content, token_count, embedding)
         values ($1, $2, $3, $4, $5::vector)`,
        [
          resolved.brain.id,
          note.id,
          texts[i],
          estimateTokens(texts[i]),
          toVector(vectors[i]),
        ],
      );
    }
  }

  return {
    text: pending
      ? `Saved to ${handle} and queued for the owner's review. It will not appear ` +
        "in search until approved."
      : `Saved to ${handle}. It is searchable now.`,
    brainId: resolved.brain.id,
    ownerId: resolved.brain.owner_id,
    results: 1,
  };
}

function notFound(handle: string): ToolOutcome {
  return {
    text:
      `No brain "${handle}" is available to you. Call brain_list to see what is.`,
    isError: true,
  };
}
