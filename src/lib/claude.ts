import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { byokStorage } from "@/lib/byok";
import { OutputCutoff } from "@/lib/cutoff";

let client: Anthropic | null = null;
// One client per distinct user key. Keys are few (one per BYOK user, reused
// across jobs), so an unbounded map is a leak in theory, a rounding error in
// practice — revisit if BYOK users pass the thousands.
const byokClients = new Map<string, Anthropic>();

export function claude(): Anthropic {
  // A job wrapped in withOwnerKey() spends the owner's key; everything else
  // spends the platform's. Decided here so no call site needs to know.
  const byok = byokStorage.getStore();
  if (byok) {
    const cacheKey = `${byok.apiKey}|${byok.baseURL ?? ""}`;
    let c = byokClients.get(cacheKey);
    if (!c) {
      c = new Anthropic({
        apiKey: byok.apiKey,
        ...(byok.baseURL ? { baseURL: byok.baseURL } : {}),
        timeout: 240_000,
        maxRetries: 1,
      });
      byokClients.set(cacheKey, c);
    }
    return c;
  }

  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set — ingest and exams need it");
  }
  client ??= new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}),
    // The SDK's defaults are 10 minutes and 2 retries — one request a flaky
    // reseller leaves hanging can hold a job for half an hour, and the ingest
    // queue works one job at a time, so that one request stalls every brain
    // on the instance. Four minutes covers the largest extraction segment we
    // send; pg-boss retries the whole job (with the extraction cached) if a
    // page genuinely needs another go.
    timeout: 240_000,
    maxRetries: 1,
  });
  return client;
}

/** USD per million tokens. Keep in step with platform.claude.com/docs pricing. */
const PRICE: Record<string, { in: number; out: number }> = {
  "claude-opus-5": { in: 5, out: 25 },
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/**
 * Get a structured object back from the model.
 *
 * Uses a forced tool call rather than `output_config.format`. Both work on the
 * first-party API, but a proxy in front of it (apimart, OpenRouter) accepts
 * `output_config` and silently ignores it — you get free-form markdown and a
 * JSON.parse error on every single request. Tool calling is older and passes
 * through everything, so this path works on both.
 */
export async function structured<T>(opts: {
  model: string;
  system: string;
  content: Anthropic.ContentBlockParam[];
  /** Tool name doubles as an instruction — make it a verb. */
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<{ data: T; usage: Usage }> {
  // A BYOK owner on the OpenAI protocol takes the chat.completions path —
  // same contract out (data + usage), different wire. Their chosen model
  // replaces ours for every role: we cannot know a stranger's catalogue.
  const byok = byokStorage.getStore();
  if (byok?.provider === "openai") {
    const { structuredOpenAi } = await import("@/lib/openai-compat");
    const out = await structuredOpenAi<unknown>({
      apiKey: byok.apiKey,
      baseURL: byok.baseURL ?? "https://api.openai.com/v1",
      model: byok.model ?? "gpt-4o-mini",
      system: opts.system,
      content: opts.content,
      toolName: opts.toolName,
      toolDescription: opts.toolDescription,
      schema: opts.schema,
      // A stranger's model is a stranger's limit: gpt-4o-mini tops out at
      // 16k output and 400s on anything larger, so a caller asking for the
      // room a Claude model has must not turn into a hard error here. Cutting
      // the ask short is recoverable — callers that can shrink their request
      // catch OutputCutoff and do; a 400 is recoverable by nobody.
      maxTokens: Math.min(opts.maxTokens ?? 16_000, 16_000),
    });
    return { data: unstringify(out.data, opts.schema) as T, usage: out.usage };
  }

  const response = await claude().messages.create({
    // An Anthropic-compatible endpoint that is not Anthropic — Kimi's coding
    // plan, Bedrock-style gateways — speaks the same protocol with its own
    // catalogue, and MODEL_EXTRACT means nothing there. The openai path has
    // always replaced the model this way; this one used to send our id to
    // their server and get model_not_found for every call.
    model: byok?.model || opts.model,
    max_tokens: opts.maxTokens ?? 16000,
    system: [
      // Same prefix for every call in a batch, so it caches.
      { type: "text", text: opts.system, cache_control: { type: "ephemeral" } },
    ],
    tools: [
      {
        name: opts.toolName,
        description: opts.toolDescription,
        input_schema: opts.schema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: opts.toolName },
    messages: [{ role: "user", content: opts.content }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("request refused by safety classifier");
  }

  // A tool call cut off mid-JSON gets repaired into an object missing its
  // fields, and the schema check then reports a mismatch — which sends you
  // looking at the schema instead of at the output limit. Say what happened.
  if (response.stop_reason === "max_tokens") {
    throw new OutputCutoff(
      `ran out of output room after ${response.usage.output_tokens} tokens — ` +
        "the answer was cut off, not malformed. Give it a smaller input or " +
        "a larger max_tokens.",
    );
  }

  const call = response.content.find((b) => b.type === "tool_use");
  if (!call || call.type !== "tool_use") {
    // Happens when a proxy drops tool_choice — worth naming precisely, since
    // the fix is "use a different endpoint", not "retry".
    const text = response.content.find((b) => b.type === "text");
    throw new Error(
      `model did not call ${opts.toolName} (stop_reason=${response.stop_reason})` +
        (text && text.type === "text" ? `: ${text.text.slice(0, 160)}` : ""),
    );
  }

  return { data: unstringify(call.input, opts.schema) as T, usage: response.usage };
}

/**
 * Take the JSON out of a field the model quoted.
 *
 * Weaker models — and every proxy that re-serialises a tool call on the way
 * through — hand back an array or object argument as a JSON *string*:
 * `{"verdicts": "[{...}]"}` instead of `{"verdicts": [{...}]}`. The schema
 * check then reports "expected array, received string" and a whole exam dies
 * over an encoding detail, with the right answer sitting inside the quotes.
 * Only fields the schema itself declares as array or object are touched, so a
 * string that is genuinely meant to be a string is never parsed.
 */
export function unstringify(data: unknown, schema: Record<string, unknown>): unknown {
  const props = (schema as { properties?: Record<string, { type?: string }> }).properties;
  if (!props || typeof data !== "object" || data === null) return data;

  const out = data as Record<string, unknown>;
  for (const [key, spec] of Object.entries(props)) {
    const value = out[key];
    if (typeof value !== "string") continue;
    if (spec?.type !== "array" && spec?.type !== "object") continue;
    try {
      const parsed: unknown = JSON.parse(value);
      // A quoted scalar ("7") parses too — that is not the shape we are
      // rescuing, and swapping it in would hide the real mismatch.
      if (typeof parsed === "object" && parsed !== null) out[key] = parsed;
    } catch {
      // Leave it: the caller's schema error names the real shape, which is
      // more useful than "unparseable" from here.
    }
  }
  return out;
}

/**
 * Cost in cents. Cache reads bill at ~0.1x input, writes at ~1.25x — ignoring
 * that would overstate ingest cost by a third once caching kicks in.
 */
export function costCents(model: string, usage: Usage): number {
  // Resellers hand out dated ids (claude-haiku-4-5-20251001) and suffixed
  // variants (-thinking). Same model, same price — strip to the base id or
  // every cost lands as zero and the economics look free.
  const base = model.replace(/-\d{8}$/, "").replace(/-thinking$/, "");
  const p = PRICE[base];
  if (!p) {
    // A BYOK job spends the owner's key on a catalogue we do not price — Kimi's
    // k3, a local model, whatever they pointed us at. Zero is the honest number
    // for what the platform paid, and saying so once per call would be four
    // thousand log lines on one ingest run.
    if (byokStorage.getStore()) return 0;
    console.warn(`[cost] no price for model "${model}" — reporting 0`);
    return 0;
  }
  const read = usage.cache_read_input_tokens ?? 0;
  const write = usage.cache_creation_input_tokens ?? 0;
  const usd =
    ((usage.input_tokens * p.in + read * p.in * 0.1 + write * p.in * 1.25) / 1e6) +
    (usage.output_tokens * p.out) / 1e6;
  return Math.round(usd * 100 * 1000) / 1000; // keep sub-cent precision
}
