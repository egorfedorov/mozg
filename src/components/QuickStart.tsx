"use client";

import { useActionState } from "react";
import { quickStart } from "@/app/brains/actions";

/**
 * The one-field pitch: link in, trained brain out. Lives on the empty
 * dashboard because the first minute decides whether anyone stays.
 */
export default function QuickStart() {
  const [state, action, pending] = useActionState(quickStart, null);

  return (
    <form action={action} className="panel" style={{ display: "grid", gap: ".6rem" }}>
      <label style={{ display: "grid", gap: ".35rem" }}>
        <span style={{ fontWeight: 600 }}>Teach it from a link</span>
        <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)" }}>
          Paste a documentation URL — every page is found and read, a goal is
          drafted from the material, and the brain sits its first exam by
          itself. For docs sites that are JavaScript apps, paste the GitHub
          repository.
        </span>
      </label>

      <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
        <input
          name="url"
          type="text"
          autoFocus
          placeholder="https://stake-engine.com/docs — or github.com/owner/repo"
          style={{
            flex: 1,
            minWidth: 260,
            padding: ".7rem .85rem",
            border: "1.5px solid var(--ink)",
            background: "var(--paper)",
            font: "inherit",
            fontSize: ".9375rem",
          }}
        />
        <button className="btn" disabled={pending}>
          {pending ? "Starting…" : "Build the brain"}
        </button>
      </div>

      {state?.error && (
        <p className="mono" style={{ color: "var(--color-riso-red)", fontSize: ".8125rem", margin: 0 }}>
          {state.error}
        </p>
      )}
    </form>
  );
}
