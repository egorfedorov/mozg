"use client";

import { useState } from "react";

/**
 * The 60-second path: copy one line, paste it in a terminal. Anything that
 * makes a user read docs before their first `brain_search` is a lost user.
 */
export default function ConnectBox({
  slug,
  hasToken,
}: {
  slug: string;
  /** Tokens are stored hashed, so we can only say whether one exists. */
  hasToken: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3300";
  const command =
    `claude mcp add --transport http mozg ${base}/mcp` +
    ` --header "Authorization: Bearer YOUR_TOKEN"`;

  async function copy() {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="term">
      <div className="term-bar">
        <span className="term-dot" />
        <span className="term-dot" />
        <span className="term-dot" />
        <span style={{ marginLeft: ".5rem" }}>connect</span>
      </div>

      <div style={{ marginBottom: ".9rem", wordBreak: "break-all" }}>
        <span className="c">$</span> {command}
      </div>

      {hasToken ? (
        <>
          <button
            className="btn"
            onClick={copy}
            style={{
              background: copied ? "var(--color-riso-green)" : "var(--color-riso-yellow)",
              color: "var(--ink)",
              borderColor: copied ? "var(--color-riso-green)" : "var(--color-riso-yellow)",
            }}
          >
            {copied ? "Copied" : "Copy command"}
          </button>
          <div className="c" style={{ marginTop: ".75rem" }}>
            replace YOUR_TOKEN — tokens are stored hashed, so we cannot show yours
            again
          </div>
        </>
      ) : (
        <>
          <a
            className="btn"
            href="/settings/tokens"
            style={{
              background: "var(--color-riso-yellow)",
              color: "var(--ink)",
              borderColor: "var(--color-riso-yellow)",
            }}
          >
            Create a token first
          </a>
          <div className="c" style={{ marginTop: ".75rem" }}>
            the command needs a token — it is shown once, when you make it
          </div>
        </>
      )}

      <div style={{ marginTop: "1.1rem" }} className="c">
        then, in your editor:
      </div>
      <div>
        <span className="u">&gt;</span> use mozg:{slug} — …
      </div>
    </section>
  );
}
