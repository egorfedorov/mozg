"use client";

import { useActionState, useState } from "react";
import { createIchiToken } from "./actions";

/**
 * Minting an ichi token, on mozg's account page.
 *
 * A near-twin of TokenForm rather than a shared one taking a `product` prop:
 * the command it prints, the server it names and the warning it gives are all
 * different, and a component with two of everything behind a flag is harder to
 * read than two components with one each.
 */
export default function IchiTokenForm() {
  const [state, action, pending] = useActionState(createIchiToken, null);
  const [copied, setCopied] = useState(false);

  if (state && "token" in state) {
    const command = `claude mcp add --transport http ichi https://ichi.mozg.sh/mcp --header "Authorization: Bearer ${state.token}"`;
    return (
      <section className="term" style={{ marginTop: "1.5rem" }}>
        <div className="term-bar">
          <span className="term-dot" />
          <span className="term-dot" />
          <span className="term-dot" />
          <span style={{ marginLeft: ".5rem" }}>copy this now</span>
        </div>
        <div style={{ wordBreak: "break-all", marginBottom: ".9rem" }}>
          <span className="c">$</span> {command}
        </div>
        <button
          className="btn"
          style={{
            background: copied ? "var(--color-riso-green)" : "var(--color-riso-yellow)",
            color: "var(--ink)",
            borderColor: copied ? "var(--color-riso-green)" : "var(--color-riso-yellow)",
          }}
          onClick={async () => {
            await navigator.clipboard.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Copied" : "Copy command"}
        </button>
        <div className="c" style={{ marginTop: "1rem" }}>
          This is the only time the token is shown. Losing it means making a new one.
        </div>
      </section>
    );
  }

  return (
    <form
      action={action}
      style={{ display: "flex", gap: ".75rem", marginTop: "1.5rem", flexWrap: "wrap" }}
    >
      <input
        name="name"
        placeholder="What machine is this for? e.g. macbook"
        maxLength={60}
        style={{
          flex: 1,
          minWidth: 240,
          padding: ".7rem .85rem",
          border: "1.5px solid var(--ink)",
          background: "var(--paper-2)",
          font: "inherit",
        }}
      />
      <button className="btn" disabled={pending}>
        {pending ? "Creating…" : "New ichi token"}
      </button>
      {state && "error" in state && (
        <p role="alert" style={{ width: "100%", margin: 0, color: "var(--ink-2)" }}>
          {state.error}
        </p>
      )}
    </form>
  );
}
