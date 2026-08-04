"use client";

import { useActionState, useState } from "react";

/** Presets: pick a provider, the wire protocol and base URL come along. */
const PRESETS: Record<string, { wire: "anthropic" | "openai"; base: string; model: string }> = {
  anthropic: { wire: "anthropic", base: "", model: "" },
  openai: { wire: "openai", base: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  kimi: { wire: "openai", base: "https://api.moonshot.ai/v1", model: "kimi-k2-0905-preview" },
  deepseek: { wire: "openai", base: "https://api.deepseek.com", model: "deepseek-chat" },
  qwen: { wire: "openai", base: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  glm: { wire: "openai", base: "https://api.z.ai/api/paas/v4", model: "glm-4.6" },
  custom: { wire: "openai", base: "", model: "" },
};
import { saveAiKey } from "./actions";

/**
 * Bring your own key. The open-core deal in one panel: set your own API key
 * and your brains train on your spend — the platform's training caps step
 * aside. Or train free through a Claude Code subscription with /mozg:train.
 */
export default function AiKeyPanel({
  hint,
  baseUrl,
  provider,
  model,
}: {
  hint: string | null;
  baseUrl: string | null;
  provider: "anthropic" | "openai";
  model: string | null;
}) {
  const [state, action, pending] = useActionState(saveAiKey, null);
  const activeHint = state && "hint" in state ? state.hint : state && "removed" in state ? null : hint;
  const [preset, setPreset] = useState(provider === "openai" ? "custom" : "anthropic");
  const [base, setBase] = useState(baseUrl ?? "");
  const [modelValue, setModelValue] = useState(model ?? "");
  function pick(k: string) {
    setPreset(k);
    const p = PRESETS[k];
    if (p.base) setBase(p.base);
    if (p.model) setModelValue(p.model);
    if (k === "anthropic") { setBase(""); setModelValue(""); }
  }

  return (
    <div className="panel" style={{ marginTop: "1.5rem" }}>
      <p className="eyebrow">Train on your own key</p>
      <p style={{ color: "var(--ink-2)", margin: ".4rem 0 0", maxWidth: "62ch" }}>
        Building a brain spends model tokens. Set a key from{" "}
        <strong>any</strong> provider — Claude (Anthropic), OpenAI, Kimi,
        DeepSeek, Qwen, GLM or a compatible reseller — and extraction, exams
        and lessons for <strong>your</strong> brains run on{" "}
        <strong>your</strong> spend; the plan&apos;s daily training budget and
        exam caps stop applying. Prefer no key at all? The Claude Code
        plugin&apos;s <span className="mono">/mozg:train</span> teaches a
        brain through your existing Claude subscription.
      </p>

      {activeHint && (
        <p className="mono" style={{ fontSize: ".8125rem", margin: ".75rem 0 0", color: "var(--color-riso-green)" }}>
          key on file: ····{activeHint} — your brains train on it
        </p>
      )}

      <form action={action} style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", marginTop: ".9rem" }}>
        <input type="hidden" name="provider" value={PRESETS[preset].wire} />
        <select
          value={preset}
          onChange={(e) => pick(e.target.value)}
          style={{ padding: ".55rem .7rem", border: "1.5px solid var(--ink)", background: "var(--paper)", font: "inherit", fontSize: ".875rem" }}
        >
          <option value="anthropic">Claude (Anthropic)</option>
          <option value="openai">OpenAI / Codex</option>
          <option value="kimi">Kimi (Moonshot)</option>
          <option value="deepseek">DeepSeek</option>
          <option value="qwen">Qwen (DashScope)</option>
          <option value="glm">GLM (Z.ai)</option>
          <option value="custom">Other OpenAI-compatible…</option>
        </select>
        {preset !== "anthropic" && (
          <input
            name="model"
            placeholder="Model id"
            value={modelValue}
            onChange={(e) => setModelValue(e.target.value)}
            autoComplete="off"
            style={{ flex: 1, minWidth: 170, padding: ".55rem .7rem", border: "1.5px solid var(--ink)", background: "var(--paper)", font: "inherit", fontSize: ".875rem" }}
          />
        )}
        <input
          name="key"
          type="password"
          placeholder={activeHint ? "Replace key (sk-…)" : "sk-… your API key"}
          autoComplete="off"
          style={{ flex: 1, minWidth: 220, padding: ".55rem .7rem", border: "1.5px solid var(--ink)", background: "var(--paper)", font: "inherit", fontSize: ".875rem" }}
        />
        <input
          name="base_url"
          placeholder="Base URL (https://…)"
          value={base}
          onChange={(e) => setBase(e.target.value)}
          autoComplete="off"
          style={{ flex: 1, minWidth: 200, padding: ".55rem .7rem", border: "1.5px solid var(--ink)", background: "var(--paper)", font: "inherit", fontSize: ".875rem" }}
        />
        <button className="btn" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        {activeHint && (
          <button className="btn btn-ghost" name="remove" value="yes" disabled={pending}>
            Remove
          </button>
        )}
      </form>

      {state && "error" in state && state.error && (
        <p className="mono" style={{ color: "var(--color-riso-red)", fontSize: ".8125rem", margin: ".6rem 0 0" }}>
          {state.error}
        </p>
      )}
      <p className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)", margin: ".75rem 0 0" }}>
        Stored encrypted; never shown again beyond its last four characters;
        used only to train and examine your own brains.
      </p>
    </div>
  );
}
