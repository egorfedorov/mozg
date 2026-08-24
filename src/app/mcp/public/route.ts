import { NextResponse } from "next/server";
import { handle, fail, MAX_BATCH, PROTOCOL_VERSION, type RpcRequest } from "@/lib/mcp-rpc";
import { anonOwner, anonRateLimited, ANON_TOOLS } from "@/lib/anon";

export const dynamic = "force-dynamic";

/**
 * The MCP door that needs no account.
 *
 * A separate route rather than a fallback inside /mcp, and that is the whole
 * design decision. /mcp answers an unauthenticated call with 401 and a
 * WWW-Authenticate header, which is exactly how an MCP client knows to start
 * the OAuth flow — make it answer anonymously instead and no client would ever
 * prompt for sign-in again. Two doors, two contracts, one dispatcher.
 *
 * What is behind it: the read tools, against the free public catalogue. The
 * paywall needs no special case, because the anonymous principal is a real
 * user row that owns nothing and has bought nothing, so "what may this caller
 * read" already answers correctly.
 *
 *   claude mcp add --transport http mozg https://mozg.sh/mcp/public
 */
export async function POST(req: Request) {
  const owner = anonOwner(req);
  owner.allowedTools = ANON_TOOLS;

  const limited = await anonRateLimited(owner.ipHash);
  if (limited) {
    // 429 with the reason in the JSON-RPC error, because an agent reads the
    // body and a human reads the status.
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32029, message: limited } },
      { status: 429 },
    );
  }

  let body: RpcRequest | RpcRequest[];
  try {
    body = await req.json();
  } catch {
    return fail(null, -32700, "Parse error", 400);
  }

  if (Array.isArray(body)) {
    if (body.length > MAX_BATCH) {
      return fail(null, -32600, `Batch too large: at most ${MAX_BATCH} requests per call.`);
    }
    const results = [];
    // One at a time: the rate check above reads the calls table, so a parallel
    // batch would pass it before the first of its own calls was recorded.
    for (const r of body) results.push(await handle(r, owner));
    const responses = results.filter(Boolean);
    return responses.length
      ? NextResponse.json(responses)
      : new NextResponse(null, { status: 202 });
  }

  const response = await handle(body, owner);
  return response ? NextResponse.json(response) : new NextResponse(null, { status: 202 });
}

/** Some clients probe with GET before opening a session. */
export async function GET() {
  return NextResponse.json({
    name: "mozg (public)",
    protocolVersion: PROTOCOL_VERSION,
    transport: "streamable-http",
    auth: "none — read-only access to the free public catalogue",
  });
}
