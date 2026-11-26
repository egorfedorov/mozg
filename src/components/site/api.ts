/**
 * The site's server, from a page. It answers beside the pages on the same
 * host, so its address is empty in the static build; in development the pages
 * run under `next dev` on another port and name it in NEXT_PUBLIC_MOZG_SITE_API.
 *
 * Every answer is `{ ok: true, … }` or `{ ok: false, error }`, and a server
 * that cannot be reached at all is `error: "network"`: a page never throws
 * over the chat, it says so.
 */

export const SITE_API = process.env.NEXT_PUBLIC_MOZG_SITE_API ?? "";

export type Answer = { ok: true } & Record<string, unknown>;

export type Refusal = { ok: false; error: string; status: number };

export async function call(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Answer | Refusal> {
  try {
    const res = await fetch(`${SITE_API}${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data.ok !== true) return { ok: false, error: typeof data.error === "string" ? data.error : String(res.status), status: res.status };
    return data as Answer;
  } catch {
    return { ok: false, error: "network", status: 0 };
  }
}

/** A value out of an answer, or a fallback: the server's shape is known, the wire is not. */
export const field = <T>(answer: Answer, name: string, fallback: T): T => {
  const value = answer[name];
  return value === undefined || value === null ? fallback : (value as T);
};
