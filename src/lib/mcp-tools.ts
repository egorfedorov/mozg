/**
 * The MCP tool surface, as data.
 *
 * Split from the handlers in lib/mcp.ts so that anything wanting to *name*
 * the tools — the machine view of the site, docs, a test — can import them
 * without dragging in the database, the queue and the storage client behind
 * the implementations.
 */

/**
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
      "holds, its known gaps, and any unfinished work an earlier session left " +
      "here. Cheap — call it before searching so you know whether this brain " +
      "can answer the question at all and which words it uses. Do not skip this " +
      "and guess at search terms.",
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
      "BEFORE answering, whenever the question names a file, a version, an API, " +
      "a config key or a convention — or asks how something is done \"here\", " +
      "\"in this project\" or \"in our setup\". Those are the answers your " +
      "training data has an outdated version of and will give confidently. " +
      "Skip it for general programming questions this brain has no stake in. " +
      "Prefer several short, specific queries over one long one. Returns ranked " +
      "excerpts with note ids — excerpts are cut short; brain_read gives the " +
      "full note.",
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
    name: "brain_handoff",
    description:
      "The baton between sessions and agents. Before stopping mid-task, LEAVE a " +
      "handoff: where you stopped, what is done, what the next session must know " +
      "— then any agent (this one tomorrow, or a different tool entirely) LISTs " +
      "open handoffs when it starts and TAKEs one to continue from that exact " +
      "point. Working state only — durable lessons belong in brain_write. " +
      "Handoffs expire after 7 days.",
    inputSchema: {
      type: "object",
      properties: {
        brain: { type: "string", description: "Brain handle the work belongs to." },
        action: { type: "string", enum: ["leave", "list", "take"] },
        title: { type: "string", description: "leave: one line — what this baton is." },
        context: {
          type: "string",
          description:
            "leave: everything the next session needs — status, decisions made, " +
            "next step, file paths. Write it for an agent with zero memory of today.",
        },
        id: { type: "string", description: "take: the handoff id from list." },
      },
      required: ["brain", "action"],
      additionalProperties: false,
    },
  },
  {
    name: "brain_verify",
    description:
      "Check a claim against the brain before acting on it or presenting it as " +
      "fact. Returns supported / contradicted / not_covered with the evidence " +
      "notes. Use it on your own drafted answer when the stakes are real — a " +
      "migration step, a money path, an API contract. A claim the brain cannot " +
      "confirm is flagged to the brain's owner as a gap.",
    inputSchema: {
      type: "object",
      properties: {
        brain: { type: "string", description: "Brain handle." },
        claim: {
          type: "string",
          description:
            "One specific, checkable statement — a value, rule or behaviour. " +
            "Not a paragraph.",
        },
      },
      required: ["brain", "claim"],
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
      "correction to something the brain had wrong, a pitfall you hit. The " +
      "moment to call it is when you have just worked something out that took " +
      "real digging and would take the next session the same digging. Write one " +
      "self-contained fact per call — it will be read alone, months later, by " +
      "someone with none of this conversation, so name the file, version or " +
      "number it turns on and say why, not only what. Do not save what the " +
      "repository or this chat already records, and never save credentials, " +
      "tokens or personal data. Works on brains you only read too: there it " +
      "saves as a proposal for the owner to review, so write it anyway rather " +
      "than dropping what you learned.",
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
    name: "brain_write_batch",
    description:
      "Save several lessons at once — the same rules as brain_write, up to 25 " +
      "notes per call. Prefer this when a training session produced a set of " +
      "notes: one call instead of many. Each note is scanned, deduplicated and " +
      "saved on its own, so one rejection loses nothing else — read the " +
      "per-note results in the reply and only redo the ones that failed. On a " +
      "brain you only read, the batch becomes proposals for its owner.",
    inputSchema: {
      type: "object",
      properties: {
        brain: { type: "string" },
        notes: {
          type: "array",
          description: "Up to 25 notes, each like a brain_write call.",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Short and searchable." },
              body: { type: "string", description: "The fact, in full sentences." },
              kind: {
                type: "string",
                enum: ["fact", "rule", "layout", "example", "pitfall"],
              },
              category: { type: "string", description: "Reuse an existing category." },
            },
            required: ["title", "body"],
            additionalProperties: false,
          },
        },
      },
      required: ["brain", "notes"],
      additionalProperties: false,
    },
  },
  {
    name: "brain_refresh",
    description:
      "Bring a brain you own up to date with its sources: re-read the pages " +
      "whose text changed since last time, and re-walk any crawled site for " +
      "pages that did not exist before. Use it when the user says a library " +
      "released a version, or when an answer from the brain turns out to be one " +
      "release behind. Cheap by construction — every page is fetched and hashed, " +
      "but only a page that actually changed is re-read by a model, and the notes " +
      "from a changed page are superseded rather than deleted. Queued, not " +
      "instant: it reports what it started, and the exam re-sits itself after.",
    inputSchema: {
      type: "object",
      properties: {
        brain: { type: "string", description: "A brain you own, by handle." },
      },
      required: ["brain"],
      additionalProperties: false,
    },
  },
  {
    name: "brain_find",
    description:
      "Find WHICH brain can answer something, when you do not already know one " +
      "exists. brain_search needs a brain by name; this needs only the question, " +
      "and searches every public brain at once. Call it before answering from " +
      "memory about any library, framework, API or platform — the catalogue " +
      "holds brains on things your training data has moved on from, and the only " +
      "reason not to use one is that nobody told you it was there. Returns the " +
      "brains that actually matched, with the evidence they matched on, so you " +
      "can judge rather than trust the name. Then brain_search that handle, or " +
      "library_add it to keep it.",
    inputSchema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description:
            "What you actually need to know, in the user's words. Full questions " +
            "beat keywords — the search is semantic.",
        },
        topic: {
          type: "string",
          description:
            "Optional field to narrow to, e.g. web, ai, gamedev, security, mobile.",
        },
      },
      required: ["question"],
      additionalProperties: false,
    },
  },
  {
    name: "library_add",
    description:
      "Put a public brain from the catalogue on your shelf, by handle. After " +
      "this it shows up in brain_list for every agent you connect, and stays " +
      "the author's — adding is not copying, so it keeps being updated by them. " +
      "Use it when brain_list showed a catalogue brain you want permanently, or " +
      "the user names a subject the catalogue covers. A paid brain needs a " +
      "purchase first; this will say so rather than half-adding it.",
    inputSchema: {
      type: "object",
      properties: {
        brain: { type: "string", description: "Handle from the catalogue, e.g. mozg/nextjs." },
      },
      required: ["brain"],
      additionalProperties: false,
    },
  },
  {
    name: "library_remove",
    description:
      "Take a brain off your shelf. The brain itself is untouched — this only " +
      "stops it appearing in brain_list. Reversible with library_add.",
    inputSchema: {
      type: "object",
      properties: {
        brain: { type: "string", description: "Handle, as shown by brain_list." },
      },
      required: ["brain"],
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
      "incomplete — brain_write a better one instead; on a brain you only read " +
      "that becomes a proposal for its owner, which is still the right move.",
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
      "duplicate. The full procedure — what the exam measures and the four " +
      "mistakes that leave a brain at 40% — is at https://mozg.sh/make.txt, " +
      "written for you rather than for a person.",
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
  {
    name: "workflow_list",
    description:
      "List the build workflows available to you: named routes through the " +
      "brains for whole jobs — \"a slot game for Stake Engine\", \"a Godot save " +
      "system\". Call this when the user asks for something BUILT rather than " +
      "answered, before planning it yourself: a workflow already names which " +
      "brains to read, in what order, and what done looks like.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "workflow_read",
    description:
      "Get one workflow in full: every step, the brain each step consults, " +
      "what to ask it, and the check that ends the step. Follow it in order " +
      "and search each named brain before writing anything — the workflow was " +
      "built around that material.",
    inputSchema: {
      type: "object",
      properties: {
        workflow: {
          type: "string",
          description: "Workflow name, \"handle/slug\" or the bare slug.",
        },
      },
      required: ["workflow"],
      additionalProperties: false,
    },
  },
];
