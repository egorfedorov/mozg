"use client";

import { useActionState } from "react";
import { saveAiKey } from "./actions";

/**
 * Bring your own key. The open-core deal in one panel: set your own API key
 * and your brains train on your spend — the platform's training caps step
 * aside. Or train free through a Claude Code subscription with /mozg:train.
 */
export default function AiKeyPanel({ hint, baseUrl }: { hint: string | null; baseUrl: string | null }) {
  const [state, action, pending] = useActionState(saveAiKey, null);
  const activeHint = state && "hint" in state ? state.hint : state && "removed" in state ? null : hint;

  return (
    <div className="panel" style={{ marginTop: "1.5rem" }}>
      <p className="eyebrow">Train on your own key</p>
      <p style={{ color: "var(--ink-2)", margin: ".4rem 0 0", maxWidth: "62ch" }}>
        Building a brain spends model tokens. With your own API key set
        (Anthropic, or any compatible reseller), extraction, exams and lessons
        for <strong>your</strong> brains run on <strong>your</strong> spend —
        and the plan&apos;s daily training budget and exam caps stop applying.
        Prefer no key at all? The Claude Code plugin&apos;s{" "}
        <span className="mono">/mozg:train</span> teaches a brain through your
        existing Claude subscription.
      </p>

      {activeHint && (
        <p className="mono" style={{ fontSize: ".8125rem", margin: ".75rem 0 0", color: "var(--color-riso-green)" }}>
          key on file: ····{activeHint} — your brains train on it
        </p>
      )}

      <form action={action} style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", marginTop: ".9rem" }}>
        <input
          name="key"
          type="password"
          placeholder={activeHint ? "Replace key (sk-…)" : "sk-… your API key"}
          autoComplete="off"
          style={{ flex: 1, minWidth: 220, padding: ".55rem .7rem", border: "1.5px solid var(--ink)", background: "var(--paper)", font: "inherit", fontSize: ".875rem" }}
        />
        <input
          name="base_url"
          placeholder="Base URL (optional, https://…)"
          defaultValue={baseUrl ?? ""}
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
