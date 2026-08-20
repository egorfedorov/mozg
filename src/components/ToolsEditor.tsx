"use client";

import { useT } from "@/lib/t-client";
import { useActionState, useState } from "react";
import { saveTools } from "@/app/brains/[slug]/exam-actions";
import type { BrainTool } from "@/lib/brain-tools";
import { MAX_TOOLS } from "@/lib/brain-tools";

/**
 * The hands, edited next to the goal rather than on a settings page, for the
 * same reason the goal is: this changes what every agent reads before it
 * searches, and that connection is invisible from a settings tab.
 *
 * One textarea of pipe-separated lines. Four inputs across four rows would be
 * sixteen pieces of form state for a list most brains never set, and the
 * server re-parses whatever arrives anyway — so the honest cheap thing is to
 * show the shape and let the parse be the validation.
 */
export default function ToolsEditor({ slug, tools }: { slug: string; tools: BrainTool[] }) {
  const t = useT();

  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(saveTools, null);

  const asText = tools
    .map((x) => [x.name, x.what, x.needs ?? "", x.install ?? ""].join(" | ").replace(/[ |]+$/, ""))
    .join("\n");

  if (!editing) {
    return (
      <div>
        {tools.length ? (
          <div className="rows" style={{ marginTop: ".6rem" }}>
            {tools.map((x) => (
              <div className="row" key={x.name}>
                <span style={{ minWidth: 0 }}>
                  <strong className="mono">{x.name}</strong>
                  <span className="row-sub">{x.what}</span>
                  {x.needs && (
                    <span className="row-meta">
                      {t("needs")}: {x.needs}
                    </span>
                  )}
                  {x.install && <span className="row-meta">{x.install}</span>}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: "var(--ink-2)", margin: ".6rem 0 0", maxWidth: "60ch" }}>
            {t("No tools declared. If this brain teaches something a program on the reader's own machine does better, name it here — the agent is told before it searches, instead of writing by hand next to a machine that would have done the job.")}
          </p>
        )}
        <button
          className="btn btn-ghost"
          style={{ marginTop: ".75rem" }}
          onClick={() => setEditing(true)}
        >
          {tools.length ? t("Edit tools") : t("Declare a tool")}
        </button>
      </div>
    );
  }

  return (
    <form action={action} style={{ marginTop: ".6rem" }}>
      <input type="hidden" name="slug" value={slug} />
      <p style={{ color: "var(--ink-2)", margin: "0 0 .5rem", fontSize: ".9375rem", maxWidth: "62ch" }}>
        {t("One per line, up to four:")}{" "}
        <code className="mono">{t("name | what it does | what it needs | how to add it")}</code>
      </p>
      <textarea
        name="tools"
        defaultValue={asText}
        rows={Math.max(3, tools.length + 1)}
        maxLength={MAX_TOOLS * 400}
        spellCheck={false}
        className="mono"
        placeholder={t("spine | rigs skeletons and exports json+atlas | Spine 4.2+ desktop app, licensed | claude mcp add spine -- uvx spine-mcp")}
        style={{
          width: "100%",
          fontSize: ".8125rem",
          padding: ".6rem .7rem",
          border: "1.5px solid var(--ink)",
          background: "var(--paper)",
          color: "var(--ink)",
          resize: "vertical",
        }}
      />
      <p className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)", margin: ".5rem 0 0", maxWidth: "62ch" }}>
        {t("The command is shown to agents to put to their human, never run on its own. mozg does not run these and cannot see whether a reader has them.")}
      </p>
      <div style={{ display: "flex", gap: ".5rem", marginTop: ".75rem", alignItems: "center" }}>
        <button className="btn" disabled={pending}>
          {pending ? t("Saving…") : t("Save")}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
          {t("Cancel")}
        </button>
        {state && "error" in state && state.error && (
          <span style={{ color: "var(--color-riso-red)", fontSize: ".875rem" }}>{state.error}</span>
        )}
        {state && "ok" in state && (
          <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>
            {t("saved")}
          </span>
        )}
      </div>
    </form>
  );
}
