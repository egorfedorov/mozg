import { AsyncLocalStorage } from "node:async_hooks";
import { maybeOne } from "@/db";
import { open } from "@/lib/secretbox";

/**
 * Bring-your-own-key plumbing. Jobs that spend model tokens wrap themselves
 * in withOwnerKey(ownerId, …); claude() then transparently builds a client
 * on the owner's key. One wrap point per job beats threading a key through
 * every extraction signature — and a job that never wraps simply bills the
 * platform, which is the safe default.
 */

export interface ByokContext {
  apiKey: string;
  baseURL?: string;
  /** 'anthropic' (messages API) or 'openai' (chat.completions — OpenAI,
      Kimi, DeepSeek, Qwen, GLM and most resellers). */
  provider: "anthropic" | "openai";
  /** For the openai protocol: the user's model id for every role. */
  model?: string;
}

export const byokStorage = new AsyncLocalStorage<ByokContext | undefined>();

export async function ownerKey(ownerId: string): Promise<ByokContext | null> {
  const row = await maybeOne<{
    ai_key_enc: string | null;
    ai_base_url: string | null;
    ai_provider: "anthropic" | "openai";
    ai_model: string | null;
  }>(
    `select ai_key_enc, ai_base_url, ai_provider, ai_model from "user" where id = $1`,
    [ownerId],
  );
  if (!row?.ai_key_enc) return null;
  const apiKey = open(row.ai_key_enc);
  if (!apiKey) return null;
  return {
    apiKey,
    baseURL: row.ai_base_url ?? undefined,
    provider: row.ai_provider,
    model: row.ai_model ?? undefined,
  };
}

/** Run fn with the owner's key in context when they have one. */
export async function withOwnerKey<T>(ownerId: string, fn: () => Promise<T>): Promise<T> {
  const ctx = await ownerKey(ownerId);
  if (!ctx) return fn();
  return byokStorage.run(ctx, fn);
}

/** True when this owner trains on their own spend — our-cost limits step aside. */
export async function ownsSpend(ownerId: string): Promise<boolean> {
  return (await ownerKey(ownerId)) !== null;
}
