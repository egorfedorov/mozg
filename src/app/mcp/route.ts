import { NextResponse } from "next/server";
import { query, maybeOne } from "@/db";
import { TOOLS, callTool } from "@/lib/mcp";
import { reportError } from "@/lib/errors";
import { verifyToken, quotaRemaining, burstExceeded } from "@/lib/tokens";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import type { Plan } from "@/db/types";
import { captureServer } from "@/lib/analytics";

/**
 * MCP endpoint — JSON-RPC 2.0 over HTTP.
 *
 * Hand-rolled rather than wired through the MCP SDK: its streamable transport
 * wants Node `req`/`res`, App Router hands us a Web `Request`, and the shim
 * between them is more moving parts than the protocol itself. A stateless
 * tools-only server needs `initialize`, `tools/list`, `tools/call` and `ping`.
 *
 * Auth is a bearer token (see /settings/tokens):
 *   claude mcp add --transport http mozg https://mozg.sh/mcp \
 *     --header "Authorization: Bearer mzg_..."
 */

const PROTOCOL_VERSION = "2025-06-18";

/** See the batch note in POST: larger batches would outrun the quota checks. */
const MAX_BATCH = 10;

interface RpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const fail = (id: RpcRequest["id"], code: number, message: string, status = 200) =>
  NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status });

/** Tool arguments, whether the client sent an object or the JSON string of one. */
function parseArgs(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

/**
 * Why the call was refused, in words the agent can act on.
 *
 * "Unauthorized" is true and useless: the commonest cause by far is a plugin
 * whose MOZG_TOKEN was never exported, and the shell then sends the header
 * literally — the agent reads a bare 401, tells its user the brain is
 * unavailable, and nobody learns that one export line fixes it. Every branch
 * here names the fix.
 */
function unauthorizedReason(req: Request): string {
  const raw = req.headers.get("authorization");
  if (!raw) {
    return (
      "Unauthorized: no token. Make one at https://mozg.sh/connect and set it as " +
      "MOZG_TOKEN in your shell profile (the plugin sends it), or sign in through " +
      "OAuth if your client supports it."
    );
  }
  // An unexpanded shell variable arrives verbatim. Recognising it saves the
  // user from debugging our server instead of their profile.
  if (raw.includes("${") || raw.includes("$MOZG_TOKEN")) {
    return (
      "Unauthorized: the token placeholder was sent unexpanded — your shell did " +
      "not have MOZG_TOKEN set when the MCP server started. Export it in your " +
      "profile (get one at https://mozg.sh/connect) and restart the client."
    );
  }
  if (!/^bearer\s/i.test(raw)) {
    return 'Unauthorized: the Authorization header must read "Bearer mzg_...".';
  }
  return (
    "Unauthorized: this token is unknown, revoked, or belongs to a deleted " +
    "account. Check https://mozg.sh/settings/tokens — issuing a new one takes a click."
  );
}

export async function POST(req: Request) {
  let owner = await verifyToken(req.headers.get("authorization"));

  // Second door: OAuth access tokens (ChatGPT connectors and every other
  // client that speaks MCP auth). Same Owner shape out, so nothing below
  // knows which door was used; quotas and metering run on userId either way.
  if (!owner) {
    try {
      const oauth = await auth.api.getMcpSession({ headers: req.headers as unknown as Headers });
      if (oauth?.userId) {
        const u = await maybeOne<{ plan: Plan }>(
          `select plan from "user" where id = $1`,
          [oauth.userId],
        );
        if (u) owner = { userId: oauth.userId, tokenId: "oauth", plan: u.plan };
      }
    } catch {
      // An unparseable or expired OAuth token reads as "no session".
    }
  }

  if (!owner) {
    // 401 + WWW-Authenticate is what MCP clients look for to prompt for
    // auth; resource_metadata points OAuth-capable ones at discovery.
    // Behind nginx the request origin is localhost — the advertised URL must
    // be the public one.
    const base = env.NEXT_PUBLIC_APP_URL;
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: unauthorizedReason(req) } },
      {
        status: 401,
        headers: {
          "WWW-Authenticate":
            `Bearer realm="mozg", resource_metadata="${base}/.well-known/oauth-protected-resource"`,
        },
      },
    );
  }

  let body: RpcRequest | RpcRequest[];
  try {
    body = await req.json();
  } catch {
    return fail(null, -32700, "Parse error", 400);
  }

  // Batches are legal JSON-RPC; clients rarely send them, but dropping them
  // silently would be a confusing failure. Capped, and run one at a time: the
  // burst and quota checks read the calls table, so a parallel batch would
  // pass every check before the first call was ever recorded.
  if (Array.isArray(body)) {
    if (body.length > MAX_BATCH) {
      return fail(null, -32600, `Batch too large: at most ${MAX_BATCH} requests per call.`);
    }
    const results = [];
    for (const r of body) results.push(await handle(r, owner));
    const responses = results.filter(Boolean);
    return responses.length
      ? NextResponse.json(responses)
      : new NextResponse(null, { status: 202 });
  }

  const response = await handle(body, owner);
  return response ? NextResponse.json(response) : new NextResponse(null, { status: 202 });
}

type Owner = NonNullable<Awaited<ReturnType<typeof verifyToken>>>;

/** Returns null for notifications, which must not get a response body. */
async function handle(rpc: RpcRequest, owner: Owner) {
  const { id, method, params = {} } = rpc;

  switch (method) {
    case "initialize":
      return {
        jsonrpc: "2.0" as const,
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "mozg", version: "0.1.0" },
          // Written as a working order rather than a description. The old
          // version said what the tools were for and left the agent to infer
          // when — which it did by never inferring it, and answering from
          // training data with a brain sitting one call away. Each line names
          // the moment, because a moment is what an agent can act on.
          instructions:
            "mozg holds project-specific knowledge brains — material that is " +
            "newer than your training data and scored against an exam.\n" +
            "- Call brain_list once at the start of a session.\n" +
            "- Call brain_brief on a brain before your first search in it: it " +
            "returns the vocabulary to search with, the gaps not to trust, and " +
            "any unfinished work left by an earlier session.\n" +
            "- Call brain_search BEFORE answering whenever the question touches " +
            "this project's conventions, file layout, versions, APIs, or any " +
            "\"how do we do X here\" — your training data does not know these " +
            "and will sound confident anyway. Skip it for general programming " +
            "questions the brain has no stake in.\n" +
            "- Call brain_write after working something out that cost real " +
            "effort to find and would cost the next session the same. On brains " +
            "you only read, this becomes a proposal for the owner — still worth " +
            "sending.\n" +
            "- Call brain_handoff to leave working state when you stop mid-task.",
        },
      };

    case "notifications/initialized":
    case "notifications/cancelled":
      return null;

    case "ping":
      return { jsonrpc: "2.0" as const, id, result: {} };

    case "tools/list":
      return { jsonrpc: "2.0" as const, id, result: { tools: TOOLS } };

    case "tools/call": {
      const name = String(params.name ?? "");
      // Some clients forward the model's tool call verbatim and send
      // `arguments` as the JSON *string* it arrived in. Every field then reads
      // as undefined and the tool answers "title and body are required" to a
      // caller that sent both — so parse the quoted form before dispatching.
      const args = parseArgs(params.arguments);

      // A tool that does not exist is a protocol error, not a tool that ran
      // and failed. A client working from a stale tool list has to be able to
      // tell those apart — otherwise it reads "Unknown tool" as an answer and
      // tries again with the same name.
      if (!TOOLS.some((t) => t.name === name)) {
        return {
          jsonrpc: "2.0" as const,
          id,
          error: {
            code: -32602,
            message: `Unknown tool: ${name}. Call tools/list for what is available.`,
          },
        };
      }

      if (await burstExceeded(owner.userId)) {
        return {
          jsonrpc: "2.0" as const,
          id,
          result: {
            content: [
              {
                type: "text",
                text:
                  "Rate limited: more than 60 calls in the last minute. Wait a " +
                  "moment before searching again, and prefer fewer, more specific " +
                  "queries over many broad ones.",
              },
            ],
            isError: true,
          },
        };
      }

      const remaining = await quotaRemaining(owner.userId, owner.plan);
      if (remaining <= 0) {
        return {
          jsonrpc: "2.0" as const,
          id,
          result: {
            content: [
              {
                type: "text",
                text:
                  `Monthly call quota reached on the ${owner.plan} plan. ` +
                  "Tell the user to upgrade at mozg.sh/settings.",
              },
            ],
            isError: true,
          },
        };
      }

      const started = Date.now();
      let outcome;
      try {
        outcome = await callTool(name, args, owner);
      } catch (err) {
        // err.message can carry pg details (relation names, constraint text) —
        // schema information a caller has no business seeing. Report it to the
        // error center (admin-only surface), answer with something generic.
        reportError("mcp", name, err, { userId: owner.userId });
        outcome = {
          text: "Tool failed with an internal error. The details are logged; do not retry the same call.",
          isError: true,
        };
      }

      // Metering is the same table billing will read — record every call,
      // including the failed ones, or the numbers lie. Awaited rather than
      // fire-and-forget so a batched call's burst/quota check sees the calls
      // before it; a failed insert must still not fail the tool call.
      await query(
        `insert into calls
           (brain_id, caller_id, owner_id, tool, query, results, top_score, latency_ms, ok, error)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          outcome.brainId ?? null,
          owner.userId,
          outcome.ownerId ?? null,
          name,
          typeof args.query === "string" ? args.query.slice(0, 500) : null,
          outcome.results ?? null,
          outcome.topScore ?? null,
          Date.now() - started,
          !outcome.isError,
          // The reason rides with the row: 24 failed calls once took latency
          // forensics to explain because ok=false carried no text.
          outcome.isError ? outcome.text.slice(0, 300) : null,
        ],
      ).catch(() => {});

      // The v1 activation metric (PLAN.md): signup → first brain_search. The
      // metering row above just landed, so a count of one means this was it.
      if (name === "brain_search" && !outcome.isError) {
        const seen = await maybeOne<{ n: number }>(
          `select count(*)::int as n from calls
            where caller_id = $1 and tool = 'brain_search'`,
          [owner.userId],
        ).catch(() => null);
        if (seen?.n === 1) {
          captureServer(owner.userId, "first_brain_search", {
            brain_id: outcome.brainId ?? null,
          });
        }
      }

      return {
        jsonrpc: "2.0" as const,
        id,
        result: {
          content: [{ type: "text", text: outcome.text }],
          isError: outcome.isError ?? false,
        },
      };
    }

    default:
      return {
        jsonrpc: "2.0" as const,
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
  }
}

/** Some clients probe with GET before opening a session. */
export async function GET() {
  return NextResponse.json(
    { name: "mozg", protocolVersion: PROTOCOL_VERSION, transport: "streamable-http" },
    { status: 200 },
  );
}
