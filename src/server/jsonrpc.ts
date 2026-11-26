/**
 * JSON-RPC 2.0 over newline-delimited JSON, which is how MCP speaks on stdio.
 *
 * Small and hand-written on purpose: the plugin ships one file with no
 * dependencies, and a local server over stdio needs none of what the full
 * SDK carries (transports, authorisation, capability negotiation).
 *
 * A request is answered on the same stream, one line per message. A
 * notification (no `id`) is never answered: replying to one is a protocol
 * error that makes clients disconnect. A batch is answered with a batch.
 */

import type { Readable, Writable } from "node:stream";

export type Params = Record<string, unknown>;

export type Handler = (method: string, params: Params) => Promise<unknown>;

interface Message {
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

function obj(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fail(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id: id === undefined ? null : id, error: { code, message } };
}

/** Thrown by a handler that wants a specific code: an unknown method or tool is the caller's mistake, not a crash. */
export class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;

/** One incoming line → the line to send back, or null when there is nothing to say. */
export async function dispatch(text: string, handler: Handler): Promise<string | null> {
  if (!text.trim()) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return JSON.stringify(fail(null, -32700, "Parse error"));
  }

  const batch = Array.isArray(parsed) ? parsed : [parsed];
  const replies: unknown[] = [];
  for (const item of batch) {
    const message: Message = obj(item) ? item : {};
    const notice = message.id === undefined;
    if (!obj(item) || typeof message.method !== "string") {
      if (!notice) replies.push(fail(message.id, -32600, "Invalid Request"));
      continue;
    }
    try {
      const result = await handler(message.method, obj(message.params) ? message.params : {});
      if (!notice) replies.push({ jsonrpc: "2.0", id: message.id, result: result ?? {} });
    } catch (err) {
      // The message is for the client that asked, on its own machine; a bare
      // "Internal error" would send nobody anywhere useful.
      if (!notice) {
        const text = err instanceof Error ? err.message : String(err);
        replies.push(fail(message.id, err instanceof RpcError ? err.code : -32603, text));
      }
    }
  }
  if (!replies.length) return null;
  return JSON.stringify(Array.isArray(parsed) ? replies : replies[0]);
}

/** Read requests from `input` until it closes, writing replies to `out`. */
export async function serve(input: Readable, out: Writable, handler: Handler): Promise<void> {
  let buffer = "";
  // One line at a time, in order: two requests replied to out of order look
  // like a server that mixed up its ids.
  input.setEncoding("utf8");
  for await (const chunk of input) {
    buffer += chunk as string;
    for (let nl = buffer.indexOf("\n"); nl !== -1; nl = buffer.indexOf("\n")) {
      const reply = await dispatch(buffer.slice(0, nl), handler);
      buffer = buffer.slice(nl + 1);
      if (reply !== null) out.write(`${reply}\n`);
    }
  }
}
