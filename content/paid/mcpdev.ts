export const NOTES: {
  title: string;
  body: string;
  category: string;
  kind: "fact" | "rule" | "layout" | "example" | "pitfall";
}[] = [
  // ── Transports and deployment ─────────────────────────────────────────────

  {
    title: "stdio, SSE, or streamable HTTP — which transport should I build on in 2026?",
    body: "As of early 2026: streamable HTTP is the current remote transport, introduced in spec 2025-03-26 and hardened in 2025-06-18. It is a single endpoint accepting POST (JSON-RPC requests, optionally answered over an SSE stream) and GET (a server-pushed stream). The older 'HTTP+SSE' transport from 2024-11-05 — separate /sse and /messages endpoints — is deprecated; only support it if you must serve year-old clients. stdio remains the right choice for local servers a client launches as a subprocess (desktop extensions, CLI-installed tools): zero network surface, auth inherited from the environment. Rule of thumb: local and single-user → stdio; hosted, multi-user, or behind a URL → streamable HTTP.",
    category: "Transports and deployment",
    kind: "fact",
  },
  {
    title: "Should my MCP server be stateless or stateful?",
    body: "Prefer stateless unless you have a real reason not to. In streamable HTTP a stateful server issues an Mcp-Session-Id at initialize and expects it back on every request; that id pins the client to one process, which breaks naive horizontal scaling and serverless deployments where the next POST lands on a different instance. A stateless tools-only server — initialize, tools/list, tools/call, ping — needs no session id at all: treat each call as self-contained, carry auth in the bearer token, and return 200/202 per request. That is exactly what a production Next.js route handler can serve with no session store. If you genuinely need sessions (progress notifications, subscriptions), store session state in Redis or Postgres, never in process memory.",
    category: "Transports and deployment",
    kind: "rule",
  },
  {
    title: "My client sends Mcp-Session-Id and MCP-Protocol-Version headers — do I need them?",
    body: "MCP-Protocol-Version: since spec 2025-06-18, clients send this header on every request after initialize, carrying the negotiated version. A lenient server can ignore it, but a strict one should validate it and answer 400 on a version it cannot speak — silently assuming the version is how subtle incompatibilities ship. Mcp-Session-Id: only required if YOU issued one during initialize. If you never return a session id, a well-behaved client will not send one; if it does, ignoring it is fine for stateless operation. Where you do issue ids: return 404 for an unknown/expired session id so the client re-initializes, per the spec — do not invent a new session silently.",
    category: "Transports and deployment",
    kind: "fact",
  },
  {
    title: "Why does the MCP SDK not fit my Next.js / edge route handler?",
    body: "The official TypeScript SDK's StreamableHTTPServerTransport was written against Node's IncomingMessage/ServerResponse. Frameworks that hand you a Web Request/Response (Next.js App Router, Cloudflare Workers, Deno) need an adapter that shims both directions, and that shim is more moving parts than the protocol itself for a small tool surface. Hand-rolling is legitimate: the wire format is plain JSON-RPC 2.0 — a switch over method names handling initialize, notifications/initialized (return 202, no body), ping, tools/list, tools/call. Production servers do exactly this and gain full control over auth, batching, and metering. Reach for the SDK once you need SSE streaming, sessions, or client-side features — not for a request/response tools endpoint.",
    category: "Transports and deployment",
    kind: "example",
  },
  {
    title: "How do I protect a localhost MCP server from DNS rebinding?",
    body: "A stdio server is safe by construction; an HTTP server listening on localhost is not. A malicious web page can make the victim's browser POST to http://localhost:PORT or rebind its domain's DNS to 127.0.0.1 and talk to your MCP server with the user's ambient privileges. The spec (2025-06-18, security section) requires servers bound to localhost to validate the Origin header on every request and reject anything that is not from the local client; also validate the Host header so rebinding to an attacker domain fails. Browsers send Origin on POST, MCP clients do not — so 'reject if Origin is present and not expected' plus 'only listen on 127.0.0.1, never 0.0.0.0' is the practical policy.",
    category: "Transports and deployment",
    kind: "rule",
  },

  // ── OAuth and auth pitfalls ───────────────────────────────────────────────

  {
    title: "How do clients know my server needs OAuth?",
    body: "They learn it from your 401. When an unauthenticated request hits the MCP endpoint, respond with status 401 and a WWW-Authenticate header — clients key off that header to start the authorization flow. Since spec 2025-06-18, servers should also point to their protected resource metadata: either in the WWW-Authenticate header's resource_metadata parameter or at /.well-known/oauth-protected-resource, which names the authorization server. The client then discovers that server's endpoints via /.well-known/oauth-authorization-server (or OpenID configuration). The pitfall: returning a bare 401 with no header, or a JSON error body with status 200 — the client then reports a generic connection failure and the user never sees an auth prompt. Test by curling your endpoint without a token and inspecting headers.",
    category: "OAuth and auth pitfalls",
    kind: "rule",
  },
  {
    title: "Dynamic client registration — why does the OAuth flow stall before it starts?",
    body: "MCP authorization expects OAuth 2.1 with dynamic client registration (RFC 7591), because a generic client cannot pre-register with every MCP server on earth. The pitfall: most real authorization servers — Auth0, some Cognito setups, many corporate IdPs — either disable DCR or gate it behind admin approval, so the client's POST to the registration endpoint 404s or 401s and the flow dies silently before any login screen. Mitigations, in order of practicality: put a thin DCR proxy in front of your IdP that mints a client per request; document a manual client_id for big clients that allow one; or skip OAuth entirely and use bearer tokens the user pastes into their client config — the pattern many production MCP servers still ship in early 2026.",
    category: "OAuth and auth pitfalls",
    kind: "pitfall",
  },
  {
    title: "Bearer token vs full OAuth for a small MCP server — which is defensible?",
    body: "A long-lived bearer token pasted into client config (e.g. claude mcp add --transport http name URL --header \"Authorization: Bearer tok_...\") is defensible and widely used when: one user owns the token, it scopes to read-mostly operations, and you can revoke it server-side. It is how many production servers bootstrapped before OAuth tooling matured, and it sidesteps the entire DCR/consent-UX problem. Where it stops being defensible: multi-tenant servers where one token could reach another tenant's data, write-heavy tools, or anything you would put in a directory listing for strangers. Token hygiene that matters either way: prefix tokens so scanners recognize them, store only hashes, log usage per token, and rotate on suspicion without invalidating sessions.",
    category: "OAuth and auth pitfalls",
    kind: "rule",
  },
  {
    title: "Who stores and refreshes OAuth tokens — my server or the client?",
    body: "Access and refresh tokens live in the CLIENT, not your server — Claude Code, Cursor and friends persist them in their own credential stores and run the refresh flow against your token endpoint. Your server only validates access tokens per request. Two pitfalls follow. First, refresh token rotation: if your IdP rotates refresh tokens (OAuth 2.1 best practice), a client that mishandles rotation gets permanently logged out on token expiry — test a full expiry-and-refresh cycle per client you claim to support, not just first login. Second, revocation UX: users revoke access in your dashboard and are surprised the client keeps working for up to the access token's lifetime — keep access token TTLs short (minutes, not days) so revocation actually bites.",
    category: "OAuth and auth pitfalls",
    kind: "pitfall",
  },
  {
    title: "Audience validation — why did my server accept a token meant for another API?",
    body: "Confused-deputy territory: if your MCP server trusts tokens from a shared IdP without checking the audience, a token a user minted for some other service can call your tools. Since spec 2025-06-18, MCP servers are Resource Servers (RFC 9728) and clients are expected to request tokens with resource indicators (RFC 8707) naming your server — so validate that the token's aud actually equals your server's canonical URL, and reject otherwise. Also validate issuer, expiry, and signature against the IdP's JWKS on every request, caching the keys. If you issue your own opaque tokens instead, the equivalent discipline is: hash at rest, bind to a user, scope to a plan, and never log the raw value.",
    category: "OAuth and auth pitfalls",
    kind: "rule",
  },

  // ── Tool description engineering ──────────────────────────────────────────

  {
    title: "Why does the agent never call my tool even though it's installed?",
    body: "Because tool descriptions are prompts, not documentation — they are the only signal the model has for WHEN to reach for your tool, and a description that only describes gets ignored. 'Search the knowledge base' tells the model what the tool does; it says nothing about when that beats answering from memory, so the model answers from memory. Working pattern: name the trigger condition ('Call this whenever the answer depends on project-specific conventions not already in this conversation — before answering from general knowledge'), name the cost ('cheap — call before searching'), and name the next step ('excerpts are cut short; read gives the full note'). Rewrite descriptions as instructions to the model, then measure call rates — this is the highest-leverage change on a live MCP server.",
    category: "Tool description engineering",
    kind: "rule",
  },
  {
    title: "What does a before/after description rewrite look like?",
    body: "Before: 'Searches brains. Takes a query string and returns results.' — the model cannot tell when this beats its own knowledge, so it never fires. After: 'Search a brain for knowledge relevant to your current task. Call this whenever the answer depends on project-specific conventions, layouts, rules or decisions that are not already in this conversation — before answering from general knowledge. Prefer several short, specific queries over one long one. Returns ranked excerpts with note ids — excerpts are cut short; brain_read gives the full note.' Every clause is doing work: trigger condition, usage pattern, output shape, follow-up tool. Notice nothing here documents the API — a human will never read this text; only the model will.",
    category: "Tool description engineering",
    kind: "example",
  },
  {
    title: "Should error messages also be written for the model?",
    body: "Yes — the reader of every tool response, success or failure, is the model, and it will take the next action based on your wording. A good tool error says what happened, whether to retry, and what to do instead: 'Rate limited: more than 60 calls in the last minute. Wait a moment and prefer fewer, more specific queries' gives the agent a corrective behavior. 'Quota reached on the free plan. Tell the user to upgrade at /settings — do not retry' prevents a retry loop AND routes the message to the human. Anti-patterns: raw stack traces (wasted tokens, leaked internals), bare 'Internal error' (agent retries the identical call), and silent empty results (agent concludes the data does not exist). Phrase every failure as an instruction.",
    category: "Tool description engineering",
    kind: "rule",
  },
  {
    title: "Does the initialize response matter for agent behavior?",
    body: "More than most developers expect: the optional `instructions` field in the initialize result is injected into the client's context as standing guidance from your server, and it shapes behavior across the whole session — not per-tool, but per-server. Use it for the one-paragraph operating manual: when to call your server at all ('call list once at the start of a session'), the ordering between your tools ('brief before searching'), and your house rules ('save durable lessons with write'). Keep it under ~100 words — it competes with the user's context budget on every session. Do not duplicate per-tool trigger conditions here; those belong in the tool descriptions where the model sees them at selection time.",
    category: "Tool description engineering",
    kind: "fact",
  },
  {
    title: "How many tools is too many?",
    body: "Every tool you expose costs context (the full name+description+schema list rides along in every conversation) and selection accuracy — models get measurably worse at picking the right tool as the menu grows past a few dozen, and wrong-pick failures look like your server being broken. Practical ceilings: a focused server should fit in 5–10 tools; if you have 30, merge CRUD verbs into one tool with an `action` enum, or split into multiple servers. Consolidation pattern that works in production: one search tool that returns ids and excerpts, one read tool for full content — instead of a read per entity type. Fewer, sharper tools with strong descriptions beat an exhaustive API mirror every time.",
    category: "Tool description engineering",
    kind: "rule",
  },
  {
    title: "Should I A/B test tool descriptions? How?",
    body: "Yes, but not by serving random variants to users — measure first, then iterate. The minimal harness: log every tools/call with tool name, the caller's client (from headers/config), and whether the call succeeded; you are looking for tools that are listed but never called (description problem) versus called but failing (schema or implementation problem). Then replay realistic task prompts against your server with the MCP client of choice — 'debug why deploys fail on Fridays' — and observe whether the agent picks your tool unprompted. Change ONE clause at a time: the trigger condition is usually the lever. Treat description edits like prompt engineering, because that is literally what they are.",
    category: "Tool description engineering",
    kind: "example",
  },

  // ── Client differences ────────────────────────────────────────────────────

  {
    title: "Server works in Claude Code but not Cursor — why?",
    body: "Almost always one of these: (1) Transport — the client expects stdio or an older SSE setup while you only speak streamable HTTP, or vice versa; check which transports that client version supports. (2) Auth — the client only supports OAuth flows, or only static headers, and you offered the other; Cursor historically lagged Claude Code on header-based auth for remote servers. (3) Config format — each client has its own JSON shape (mcpServers vs mcp.servers vs UI-only setup), and a config that parses in one is ignored in another. (4) Tool count/context limits truncating your tool list. Debug order: confirm the client's supported transport in its current docs, then its auth method, then test with a one-tool server to isolate config from protocol.",
    category: "Client differences",
    kind: "pitfall",
  },
  {
    title: "Which MCP features can I rely on across clients as of early 2026?",
    body: "Tools are universal — every meaningful client calls tools; build your core value there. Everything else is patchwork and you must test per client before depending on it: resources and prompts are supported in some clients, ignored in others; roots (client telling the server which directories it may see) are implemented unevenly; sampling (server asking the client's model for a completion) is supported by few clients and often gated behind user consent; elicitation (server asking the user for structured input mid-tool, added in 2025-06-18) is newer still. Practical rule: ship tools-only first, expose resources/prompts as progressive enhancement, and never design a flow that REQUIRES sampling or elicitation unless you control which client runs it.",
    category: "Client differences",
    kind: "fact",
  },
  {
    title: "Does the model or the client decide when my tool fires?",
    body: "The model decides per-call, but the client decides what the model sees and is allowed to do — that split explains most 'works here, not there' mysteries. Clients differ in: whether tools are auto-approved or need per-call user consent (Claude Code has permission modes; Cursor has its own approval settings; a tool the user must approve every time effectively never fires); how many tools are injected before truncation; and system-prompt nudges that bias toward or against tool use. Two servers with identical tool lists can therefore behave differently across clients with the same underlying model. When debugging 'the agent ignores my tool', first rule out an approval prompt sitting unanswered in the UI — it looks identical to the model declining the call.",
    category: "Client differences",
    kind: "pitfall",
  },
  {
    title: "ChatGPT connectors and Codex — what do they expect from my server?",
    body: "ChatGPT's deep-research connectors impose a specific contract rather than a generic tool list: they expect tools named `search` (taking a query, returning a list of id/title/url results) and `fetch` (taking an id, returning the full document) — deviate from that shape and the connector indexes nothing, even though your server is perfectly valid MCP. Codex CLI reads its own config (config.toml, not the Claude/Cursor JSON), supports stdio and streamable HTTP servers, and passes tool results into its own context management. As of early 2026 these integrations change monthly: pin your expectations by testing against the current client, and keep a `search`/`fetch`-compatible pair on any server you want ChatGPT to use — it costs you two thin wrappers.",
    category: "Client differences",
    kind: "fact",
  },
  {
    title: "My server exposes prompts and resources — why don't users see them?",
    body: "Because clients surface them inconsistently. Slash-command style prompt discovery exists in some clients (Claude Code surfaces MCP prompts as commands), while others ignore prompts entirely or bury resources behind a UI nobody opens. The silent failure: your server reports capabilities at initialize, the client accepts them, and nothing ever calls prompts/list — no error anywhere. If a feature matters, implement it as a tool first (tools are the only universally-invoked primitive), then mirror it as a prompt/resource for clients that support it. Check capability support per client version before filing a bug against your own server — as of early 2026, the support matrix still differs release to release.",
    category: "Client differences",
    kind: "pitfall",
  },

  // ── Schemas and structured output ─────────────────────────────────────────

  {
    title: "How should I design input schemas so agents don't misuse them?",
    body: "Models read your JSON Schema as instructions, so design for the misreadings. Rules that hold up in production: (1) Few fields — each optional param is a chance the agent invents a value; make fields required or delete them. (2) Put defaults in the description, not just the schema ('Max results, 1-25. Default 8.') — some clients strip or downweight default fields. (3) Use enums for anything categorical; a freeform string typed by a model will eventually be 'ascending ' with a trailing space. (4) additionalProperties: false, so hallucinated params fail loudly instead of being silently ignored. (5) Validate server-side anyway and return actionable errors ('limit must be 1-25, got 200'), because schema rejection happens client-side in some clients and not at all in others.",
    category: "Schemas and structured output",
    kind: "rule",
  },
  {
    title: "Optional parameters — why do agents keep filling them in wrongly?",
    body: "Because an optional parameter is a suggestion the model feels free to satisfy creatively. Given an optional `since: string` a model will pass 'yesterday', 'last week', or ISO dates with wrong offsets — whatever pattern-matches the conversation. Given optional `category`, it guesses categories that do not exist. Mitigations: make the parameter required when a wrong guess is worse than no guess; constrain with enums or a description that lists valid values ('Reuse an existing category — call list first'); or accept the fuzziness and make the server normalize (case-fold, trim, fuzzy-match, and say what you matched in the response so the agent can correct). The dangerous case is optional params that silently change semantics — filters that narrow results to nothing look like 'the server has no data'.",
    category: "Schemas and structured output",
    kind: "pitfall",
  },
  {
    title: "structuredContent vs text content — which should my tools return?",
    body: "Both, when you can. Since spec 2025-06-18, a tool can declare an outputSchema and return machine-checkable `structuredContent` alongside the traditional `content` array of text blocks. Clients that support it validate and use the structured form; the text form remains the fallback and is still what most models read most fluently. Practical split: structuredContent carries ids, counts, and machine fields (note_id, results, quota); the text block carries the same facts phrased for the model plus any instructions ('excerpts are cut short; read gives the full note'). Do not dump large JSON into text hoping the model parses it — it will, mostly, until a nested quote breaks its extraction mid-task. Keep text the primary channel until you have verified your target clients consume structuredContent.",
    category: "Schemas and structured output",
    kind: "fact",
  },
  {
    title: "When should a tool return ids vs full content?",
    body: "Return ids plus the minimum to judge relevance, and a second tool to fetch full content — the search/read split. A search tool returning 8 full documents can spend tens of thousands of tokens on results the agent discards after reading titles; returning title + ~150-token excerpt + id lets the agent spend context only on what it opens. This is how production knowledge servers are shaped: search returns ranked excerpts with note_ids and a hint ('excerpts are cut short; read gives the full note'), read takes one id. The same pattern applies to any large payload: list-then-get, page-then-expand. Only inline full content when it is small by construction (a single record lookup) — context is the scarcest resource your tool output consumes.",
    category: "Schemas and structured output",
    kind: "rule",
  },
  {
    title: "Tool error vs protocol error — which one do I return?",
    body: "Use tool errors (result with isError: true and a text explanation) when the tool RAN and failed: bad arguments, rate limit, quota, upstream down, permission denied for this resource. The model sees the message and can adapt — rephrase, wait, tell the user. Use JSON-RPC protocol errors only for protocol-level failures: unknown method (-32601), unknown tool name (-32602 is the pragmatic choice), malformed params that fail schema validation outright, parse errors (-32700). The distinction matters because clients treat them differently: a protocol error means 'your request was wrong', a tool error means 'the world said no'. Classic bug: returning unknown-tool as isError text — a client with a stale tool list reads 'Unknown tool' as an answer and retries the same name forever.",
    category: "Schemas and structured output",
    kind: "rule",
  },

  // ── Debugging and testing ─────────────────────────────────────────────────

  {
    title: "How do I test my server without wiring up a real agent?",
    body: "Use the MCP Inspector: `npx @modelcontextprotocol/inspector <your-server-command-or-url>`. It gives you an interactive session against your server — initialize, browse tools/list, fire tools/call with hand-written arguments, and see the raw JSON-RPC both directions. It catches the failures clients hide: malformed schemas, wrong content types, missing fields in initialize. Before the Inspector, smoke-test the raw wire format with curl: POST an initialize, then a tools/list, then a tools/call, and confirm a bare request gets your 401 with WWW-Authenticate. Only after both pass should you connect a real client — debugging inside Claude Code conflates your server's bugs with the client's behavior and you cannot see the traffic.",
    category: "Debugging and testing",
    kind: "rule",
  },
  {
    title: "Server connects but tools never fire — where do I look?",
    body: "Work the pipeline in order. (1) Does tools/list actually reach the model? Connect the Inspector; if your tools appear there but the agent never calls them, the problem is descriptions (the model saw the menu and declined) or client approval settings (the user is being prompted and dismissing it). (2) If tools/list is empty or errors in the Inspector, your initialize handshake or schema serialization is broken — a single invalid JSON Schema field can make a client drop the whole tool list silently. (3) If tools fire but results look ignored, the response shape is wrong for that client (e.g. it expects content[0].type text and you sent only structuredContent). Logging every tools/call server-side settles which stage you are in within minutes.",
    category: "Debugging and testing",
    kind: "pitfall",
  },
  {
    title: "What should I log on a production MCP server?",
    body: "Every tools/call, with: tool name, caller identity, latency, success/failure, and enough of the arguments to debug (query text truncated to a few hundred chars — never auth headers or token values). This single table answers the three questions that matter: which tools are never called (description problem), which fail often (implementation problem), and who is hammering you (abuse or an agent in a retry loop). Also log initialize attempts with the client's protocol version — you will discover which client versions actually connect to you. Meter calls in the same table billing reads, including failed calls, or your numbers lie. What NOT to log: bearer tokens, OAuth codes, full request bodies from user data tools — your MCP logs become a secret store otherwise.",
    category: "Debugging and testing",
    kind: "rule",
  },
  {
    title: "JSON-RPC batches and notifications — what bites in production?",
    body: "Batches are legal JSON-RPC and some clients send them; silently dropping them is a confusing failure, so handle arrays explicitly — but cap the size and process sequentially if your rate limits read state per call (a parallel batch passes every quota check before the first call is recorded). Notifications (requests with no id, like notifications/initialized) must get NO response body — return HTTP 202 with an empty body; echoing a result to a notification violates the protocol and confuses strict clients. Also: some clients probe your endpoint with GET before initializing — answer with something informative (server name, protocol version, transport) rather than a bare 405, so debugging tools and health checks can tell your server is alive.",
    category: "Debugging and testing",
    kind: "fact",
  },

  // ── Scaling and limits ────────────────────────────────────────────────────

  {
    title: "How do I rate limit an MCP server without breaking agents?",
    body: "Two tiers, both enforced per-token rather than per-IP (one IP can be a whole office of agents): a burst limit (~60 calls/minute) that catches buggy retry loops, and a quota (calls/month) that maps to your pricing. The response is the important part — return a TOOL error (isError: true) with corrective instructions, not a protocol error or a bare HTTP 429 the client cannot route to the model: 'Rate limited: more than 60 calls in the last minute. Wait a moment, and prefer fewer, more specific queries over many broad ones.' For quota exhaustion, name the remedy ('quota reached on the free plan — tell the user to upgrade') and say 'do not retry', or the agent will poll you all day. Agents read error text; humans read dashboards.",
    category: "Scaling and limits",
    kind: "rule",
  },
  {
    title: "My tool returns huge payloads — how do I paginate for an agent?",
    body: "MCP defines cursor-based pagination for list operations (tools/list, resources/list) via an opaque `cursor` param and a `nextCursor` in results — honor it there, but your bigger problem is tool RESULT size, which the protocol does not paginate for you. Design it yourself: hard-cap list results (default 8–25, documented in the schema description), return excerpts instead of full bodies, and put total counts in the response so the agent knows more exists ('24 of 240 shown — narrow with a category filter'). Never stream a 500KB JSON dump into context: the model truncates mid-document and answers from a fragment. If a tool can legitimately return megabytes, make it return a reference (id/URL) plus a follow-up fetch tool with range support instead.",
    category: "Scaling and limits",
    kind: "rule",
  },
  {
    title: "Long-running tool calls — how do I keep clients from timing out?",
    body: "Clients and proxies impose timeouts you do not control (tens of seconds to a few minutes), so design for them. If work exceeds ~20 seconds, prefer an async shape: the tool returns immediately with a job id and instructions ('processing — poll job_status with this id, typically ready in under a minute'), plus a second tool to check. The protocol does offer progress notifications (progressToken) for streaming percent-done to the client, but support is uneven and they do not extend hard timeouts. Never hold the POST open indefinitely hoping — a gateway in front of you will cut the connection at 30–60s and the agent sees a transport error with no output at all. Queue the work, meter the queue, return the receipt.",
    category: "Scaling and limits",
    kind: "pitfall",
  },

  // ── Distribution and registry ─────────────────────────────────────────────

  {
    title: "How do I get my server into the MCP registry and directories?",
    body: "As of early 2026, the official MCP Registry (registry.modelcontextprotocol.io, launched in preview in late 2025) is the canonical machine-readable index clients and directories sync from. You publish a server.json manifest in your repo (name, description, repository, packages or remotes) and authenticate ownership — GitHub-based for the io.github.* namespace, DNS-based for your own domain. Beyond the official registry, third-party directories (the servers list in the modelcontextprotocol GitHub org, mcp.so, Smithery, and client-specific marketplaces like Claude's connector directory) have separate submissions and their own review bars — Smithery and the Claude directory want working hosted endpoints and OAuth. Practical order: get the server stable and documented, publish to the official registry, then submit to the two directories your users actually browse.",
    category: "Distribution and registry",
    kind: "fact",
  },
  {
    title: "What makes a directory listing convert to installs?",
    body: "The listing is a promise the agent must keep in the first five minutes, so optimize the whole path. Name and one-liner: say the trigger, not the tech ('Search your team's runbooks from any agent' beats 'MCP server for knowledge management'). Install friction: one copy-paste config block per client, tested on the current versions — a directory install that 401s with no hint is an uninstall. First-run experience: the initialize instructions should tell the agent what to do immediately ('call list once at the start of a session'), and the first tool call should return something useful even for an empty account, including what to do next. Then instrument: log installs (first initialize per token) versus first real tool call — that activation gap is where directory traffic dies.",
    category: "Distribution and registry",
    kind: "rule",
  },
];
