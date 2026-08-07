"use client";

import { useActionState } from "react";
import { inviteMember } from "./actions";

/**
 * One row: an address, a role, a button. The seat count lives above it on the
 * page, so the form does not have to explain a limit it cannot show.
 */
export default function InviteForm({ disabled }: { disabled?: boolean }) {
  const [state, action, pending] = useActionState(inviteMember, null);

  return (
    <form action={action} className="stack-tight" style={{ marginTop: "1rem" }}>
      <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
        <input
          name="email"
          type="email"
          required
          disabled={disabled}
          placeholder="colleague@studio.com"
          autoComplete="off"
          style={{
            flex: "1 1 14rem",
            minWidth: 0,
            padding: ".5rem .6rem",
            border: "1.5px solid var(--ink)",
            background: "var(--paper)",
            font: "inherit",
            fontSize: ".875rem",
          }}
        />
        <select
          name="role"
          defaultValue="contributor"
          disabled={disabled}
          style={{
            padding: ".5rem .6rem",
            border: "1.5px solid var(--ink)",
            background: "var(--paper)",
            font: "inherit",
            fontSize: ".875rem",
          }}
        >
          <option value="contributor">can propose notes</option>
          <option value="viewer">read only</option>
        </select>
        <button className="btn" type="submit" disabled={pending || disabled}>
          {pending ? "Inviting…" : "Invite"}
        </button>
      </div>

      {state?.error && (
        <p className="mono" style={{ color: "var(--color-riso-red)", fontSize: ".8125rem" }}>
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="mono" style={{ color: "var(--color-riso-green)", fontSize: ".8125rem" }}>
          {state.email} holds a seat. It opens the moment they sign in with that
          address and verify it — there is nothing for them to accept.
        </p>
      )}
    </form>
  );
}
