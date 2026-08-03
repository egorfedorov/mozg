"use client";

import { useActionState, useState } from "react";
import { deleteBrain } from "./danger-actions";

export default function DeleteBrain({
  slug,
  title,
  noteCount,
}: {
  slug: string;
  title: string;
  noteCount: number;
}) {
  const [armed, setArmed] = useState(false);
  const [state, action, pending] = useActionState(deleteBrain, null);

  return (
    <section style={{ marginTop: "2.5rem" }}>
      <h2 className="h2" style={{ marginBottom: ".5rem" }}>
        Delete this brain
      </h2>
      <p style={{ color: "var(--ink-2)", marginTop: 0, maxWidth: "58ch" }}>
        Removes {noteCount} {noteCount === 1 ? "note" : "notes"}, every source and
        every exam result. Agents pointed at it start getting &quot;no such
        brain&quot;. There is no undo — export first if you want a copy.
      </p>

      {!armed ? (
        <button
          className="btn btn-ghost"
          onClick={() => setArmed(true)}
          style={{ color: "var(--color-riso-red)", borderColor: "var(--color-riso-red)" }}
        >
          Delete brain
        </button>
      ) : (
        <form action={action} style={{ display: "grid", gap: ".6rem", maxWidth: 420 }}>
          <input type="hidden" name="slug" value={slug} />
          <label style={{ display: "grid", gap: ".35rem" }}>
            <span className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>
              Type <strong>{title}</strong> to confirm
            </span>
            <input
              name="confirm"
              autoFocus
              autoComplete="off"
              style={{
                padding: ".7rem .85rem",
                border: "1.5px solid var(--color-riso-red)",
                background: "var(--paper-2)",
                font: "inherit",
              }}
            />
          </label>

          {state?.error && (
            <p className="mono" style={{ color: "var(--color-riso-red)", fontSize: ".8125rem", margin: 0 }}>
              {state.error}
            </p>
          )}

          <div style={{ display: "flex", gap: ".5rem" }}>
            <button
              className="btn"
              disabled={pending}
              style={{
                background: "var(--color-riso-red)",
                borderColor: "var(--color-riso-red)",
              }}
            >
              {pending ? "Deleting…" : "Delete permanently"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setArmed(false)}>
              Keep it
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
