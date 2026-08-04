import type Anthropic from "@anthropic-ai/sdk";
import type { Usage } from "@/lib/claude";

/**
 * The OpenAI-compatible path for structured(): OpenAI, Kimi/Moonshot,
 * DeepSeek, Qwen, GLM and most resellers all speak POST /chat/completions
 * with function tools. Plain fetch — a whole SDK for one endpoint would be
 * a dependency for a URL.
 */

/** Anthropic content blocks → OpenAI message content parts. */
export function toOpenAiContent(
  blocks: Anthropic.ContentBlockParam[],
): { type: string; text?: string; image_url?: { url: string } }[] {
  const parts: { type: string; text?: string; image_url?: { url: string } }[] = [];
  for (const b of blocks) {
    if (b.type === "text") parts.push({ type: "text", text: b.text });
    else if (b.type === "image" && b.source.type === "base64") {
      parts.push({
        type: "image_url",
        image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` },
      });
    }
    // Other block kinds (documents…) never reach structured() today.
  }
  return parts;
}

export async function structuredOpenAi<T>(opts: {
  apiKey: string;
  baseURL: string;
  model: string;
  system: string;
  content: Anthropic.ContentBlockParam[];
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<{ data: T; usage: Usage }> {
  const url = `${opts.baseURL.replace(/\/$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${opts.apiKey}`,
    },
    signal: AbortSignal.timeout(240_000),
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 16000,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: toOpenAiContent(opts.content) },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: opts.toolName,
            description: opts.toolDescription,
            parameters: opts.schema,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: opts.toolName } },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`openai-compatible endpoint ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    choices?: {
      finish_reason?: string;
      message?: { tool_calls?: { function?: { name?: string; arguments?: string } }[] };
    }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const choice = json.choices?.[0];
  if (choice?.finish_reason === "length") {
    throw new Error(
      "ran out of output room — the answer was cut off, not malformed. " +
        "Give it a smaller input or a larger max_tokens.",
    );
  }
  const call = choice?.message?.tool_calls?.find((t) => t.function?.name === opts.toolName);
  if (!call?.function?.arguments) {
    throw new Error(
      `model did not call ${opts.toolName} (finish_reason=${choice?.finish_reason ?? "?"}) — ` +
        "this provider may ignore tool_choice; try a different model or endpoint",
    );
  }

  let data: T;
  try {
    data = JSON.parse(call.function.arguments) as T;
  } catch {
    throw new Error(`model returned unparseable tool arguments (${call.function.arguments.slice(0, 120)}…)`);
  }

  return {
    data,
    usage: {
      input_tokens: json.usage?.prompt_tokens ?? 0,
      output_tokens: json.usage?.completion_tokens ?? 0,
    },
  };
}
