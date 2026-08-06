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
}

/** Only apimart exposes this shape. Anywhere else, the feature is off. */
export function imageGenReady(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY && env.ANTHROPIC_BASE_URL?.includes("apimart"));
}

/**
 * The model, and what it costs us.
 *
 * Kept together because they lie in exactly one place otherwise: a model
 * swapped for a cheaper one leaves the recorded cost describing the old bill
 * forever, and the margin on /gallery silently becomes fiction. Measured at
 * 1K — the size the gallery renders — not at the model's maximum.
 */
const MODEL = "gemini-3.1-flash-image-preview";
export const MODEL_COST_CENTS = 3;

const API = (path: string) => `${env.ANTHROPIC_BASE_URL}/v1${path}`;

async function api<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
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
    throw new Error(`image api returned non-JSON (${res.status})`);
  }

  // The provider answers 200 with an error object as readily as it answers a
  // 4xx, so the status code alone decides nothing.
  const err = (parsed as { error?: { message?: string; code?: string } }).error;
  if (err) throw new Error(err.message ?? err.code ?? "image api error");
  if (!res.ok) throw new Error(`image api ${res.status}`);
  return parsed as T;
}

/**
 * Generate one image and return its bytes.
 *
 * Throws on anything that is not a finished picture — the caller refunds on a
 * throw, so a half-success must never look like a success here.
 */
export async function generateImage(
  prompt: string,
  opts: { aspect?: string; timeoutMs?: number } = {},
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

  const deadline = Date.now() + (opts.timeoutMs ?? 240_000);
  let url: string | null = null;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));

    // A poll that fails is not a job that failed: the provider documents
    // transient stalls on this endpoint, and re-submitting would buy the same
    // picture twice. Only a terminal status ends the loop.
    const task = await api<{
      data?: { status?: string; fail_reason?: string; results?: { url?: string }[]; url?: string };
      status?: string;
      results?: { url?: string }[];
    }>("GET", `/tasks/${taskId}?language=en`).catch(() => null);
    if (!task) continue;

    const d = task.data ?? task;
    const status = (d as { status?: string }).status ?? "";
    if (status === "failed" || status === "cancelled") {
      throw new Error((d as { fail_reason?: string }).fail_reason ?? `image job ${status}`);
    }

    const results = (d as { results?: { url?: string }[] }).results;
    const found = results?.[0]?.url ?? (d as { url?: string }).url;
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
  };
}
