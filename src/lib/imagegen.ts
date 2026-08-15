import { env } from "@/lib/env";

/**
 * Image generation, through the same Anthropic-compatible host the rest of the
 * product already talks to.
 *
 * apimart serves both an Anthropic-shaped chat API and its own image API on
 * one key, which is why this needs no new credential and no new provider to
 * operate — the key that pays for extraction pays for this. The base URL is
 * the guard: a deployment pointed straight at api.anthropic.com has no image
 * endpoint at all, so generation reports itself unavailable rather than
 * failing per request in a way that looks like a bug.
 *
 * The call is submit-then-poll, not a single request, because the model takes
 * tens of seconds. That is also why nothing here runs inside a web request:
 * the worker owns it.
 */

export interface GeneratedImage {
  bytes: Buffer;
  mime: string;
  taskId: string;
  /** What the provider says this one actually cost, in cents. */
  costCents: number;
}

/** Only apimart exposes this shape. Anywhere else, the feature is off. */
export function imageGenReady(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY && env.ANTHROPIC_BASE_URL?.includes("apimart"));
}

const MODEL = "gemini-3.1-flash-image-preview";

/**
 * What a generation costs us when the provider does not say.
 *
 * It almost always does — the task carries a `cost` in dollars — and that
 * measured number is what gets recorded, because a hardcoded one describes
 * whatever the model charged on the day it was written and then quietly
 * becomes fiction the first time the price moves. This is only the fallback
 * for a response that omitted it.
 */
export const MODEL_COST_CENTS = 2;

const API = (path: string) => `${env.ANTHROPIC_BASE_URL}/v1${path}`;

/**
 * The provider drops roughly one call in twenty with a gateway error, and a
 * measured production run put the useful backoff at three, six and nine
 * seconds. Without this an asset in a paid set fails, refunds, and leaves a
 * hole in a paytable for a reason that would have cleared by itself.
 */
export const RETRY_BACKOFF_MS = [3000, 6000, 9000] as const;

/** Worth trying again: the gateway, the load balancer, or the network — never
 *  a rejected request, which will be rejected identically forever. */
export function transient(status: number, message?: string): boolean {
  if (status === 429 || status === 408 || status >= 500) return true;
  const m = (message ?? "").toLowerCase();
  return m.includes("bad gateway") || m.includes("timeout") || m.includes("overload");
}

async function once<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(API(path), {
    method,
    headers: {
      authorization: `Bearer ${env.ANTHROPIC_API_KEY}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const err = new Error(`image api returned non-JSON (${res.status})`);
    (err as { status?: number }).status = res.status;
    throw err;
  }

  // The provider answers 200 with an error object as readily as it answers a
  // 4xx, so the status code alone decides nothing.
  const err = (parsed as { error?: { message?: string; code?: string } }).error;
  if (err) {
    const e = new Error(err.message ?? err.code ?? "image api error");
    (e as { status?: number }).status = res.status;
    throw e;
  }
  if (!res.ok) {
    const e = new Error(`image api ${res.status}`);
    (e as { status?: number }).status = res.status;
    throw e;
  }
  return parsed as T;
}

async function api<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    try {
      return await once<T>(method, path, body);
    } catch (e) {
      last = e;
      const status = (e as { status?: number }).status ?? 0;
      const message = e instanceof Error ? e.message : String(e);
      if (attempt === RETRY_BACKOFF_MS.length || !transient(status, message)) break;
      console.warn(`[imagegen] ${path} ${message} — retry ${attempt + 1}`);
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt]));
    }
  }
  throw last;
}

/**
 * Generate one image and return its bytes.
 *
 * Throws on anything that is not a finished picture — the caller refunds on a
 * throw, so a half-success must never look like a success here.
 */
export async function generateImage(
  prompt: string,
  opts: {
    aspect?: string;
    timeoutMs?: number;
    /** Called with the task id as soon as the provider accepts the job. */
    onSubmitted?: (taskId: string) => Promise<void> | void;
  } = {},
): Promise<GeneratedImage> {
  if (!imageGenReady()) throw new Error("image generation is not configured");

  const submitted = await api<{ data?: { task_id?: string } | { task_id?: string }[] }>(
    "POST",
    "/images/generations",
    {
      model: MODEL,
      prompt,
      size: opts.aspect ?? "1:1",
      n: 1,
      resolution: "1k",
    },
  );

  const first = Array.isArray(submitted.data) ? submitted.data[0] : submitted.data;
  const taskId = first?.task_id;
  if (!taskId) throw new Error("image api accepted the job without a task id");

  await opts.onSubmitted?.(taskId);

  const deadline = Date.now() + (opts.timeoutMs ?? 240_000);
  let url: string | null = null;
  let cost = MODEL_COST_CENTS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));

    // A poll that fails is not a job that failed: the provider documents
    // transient stalls on this endpoint, and re-submitting would buy the same
    // picture twice. Only a terminal status ends the loop.
    const task = await api<{ data?: Record<string, unknown> }>(
      "GET",
      `/tasks/${taskId}?language=en`,
    ).catch(() => null);
    if (!task) continue;

    const d = (task.data ?? task) as Record<string, unknown>;
    const status = String(d.status ?? "");

    if (status === "failed" || status === "cancelled" || status === "error") {
      throw new Error(String(d.fail_reason ?? d.error ?? `image job ${status}`));
    }

    // Measured against the live API rather than guessed: the task reports
    // "completed", and the picture is at data.result.images[0].url — where
    // that url is itself an ARRAY. Both details cost a full timeout each
    // before they were read off a real response.
    const result = d.result as { images?: { url?: string | string[] }[] } | undefined;
    const raw = result?.images?.[0]?.url;
    const found = Array.isArray(raw) ? raw[0] : raw;

    if (typeof d.cost === "number") cost = Math.max(1, Math.round(d.cost * 100));

    if (found) {
      url = found;
      break;
    }
  }

  if (!url) throw new Error("image generation timed out");

  const img = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!img.ok) throw new Error(`could not download the generated image (${img.status})`);
  const bytes = Buffer.from(await img.arrayBuffer());
  if (bytes.length < 1000) throw new Error("the generated image came back empty");

  return {
    bytes,
    mime: img.headers.get("content-type")?.split(";")[0] ?? "image/png",
    taskId,
    costCents: cost,
  };
}
