import { NextResponse } from "next/server";
import { query } from "@/db";
import { TOOLS, callTool } from "@/lib/mcp";
import { verifyToken, quotaRemaining, burstExceeded } from "@/lib/tokens";

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

interface RpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const ok = (id: RpcRequest["id"], result: unknown) =>
  NextResponse.json({ jsonrpc: "2.0", id, result });

const fail = (id: RpcRequest["id"], code: number, message: string, status = 200) =>
  NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status });

export async function POST(req: Request) {
  const owner = await verifyToken(req.headers.get("authorization"));
  if (!owner) {
    // 401 + WWW-Authenticate is what MCP clients look for to prompt for auth.
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="mozg"' } },
    );
  }

  let body: RpcRequest | RpcRequest[];
  try {
    body = await req.json();
  } catch {
    return fail(null, -32700, "Parse error", 400);
  }

  // Batches are legal JSON-RPC; clients rarely send them, but dropping them
  // silently would be a confusing failure.
  if (Array.isArray(body)) {
    const results = await Promise.all(body.map((r) => handle(r, owner)));
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
          instructions:
            "mozg holds project-specific knowledge brains. Call brain_list once " +
            "at the start of a session. Before answering anything that depends on " +
            "this project's own conventions, search the relevant brain rather than " +
            "answering from general knowledge. When you confirm a convention or hit " +
            "a pitfall worth keeping, save it with brain_write.",
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
      const args = (params.arguments ?? {}) as Record<string, unknown>;

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
        outcome = {
          text: `Tool failed: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      }

      // Metering is the same table billing will read — record every call,
      // including the failed ones, or the numbers lie.
      void query(
        `insert into calls
           (brain_id, caller_id, owner_id, tool, query, results, latency_ms, ok)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          outcome.brainId ?? null,
          owner.userId,
          outcome.ownerId ?? null,
          name,
          typeof args.query === "string" ? args.query.slice(0, 500) : null,
          outcome.results ?? null,
          Date.now() - started,
          !outcome.isError,
        ],
      ).catch(() => {});

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
