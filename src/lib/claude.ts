import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

let client: Anthropic | null = null;

export function claude(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set — ingest and exams need it");
  }
  client ??= new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}),
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
  const response = await claude().messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 8000,
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

  return { data: call.input as T, usage: response.usage };
}

/**
 * Cost in cents. Cache reads bill at ~0.1x input, writes at ~1.25x — ignoring
 * that would overstate ingest cost by a third once caching kicks in.
 */
export function costCents(model: string, usage: Usage): number {
  const p = PRICE[model];
  if (!p) return 0;
  const read = usage.cache_read_input_tokens ?? 0;
  const write = usage.cache_creation_input_tokens ?? 0;
  const usd =
    ((usage.input_tokens * p.in + read * p.in * 0.1 + write * p.in * 1.25) / 1e6) +
    (usage.output_tokens * p.out) / 1e6;
  return Math.round(usd * 100 * 1000) / 1000; // keep sub-cent precision
}
