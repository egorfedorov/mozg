"use client";

import { useState, useTransition } from "react";
import { createTokenInline } from "@/app/brains/[slug]/token-action";

/**
 * The 60-second path: copy one line, paste it in a terminal.
 *
 * The token is minted right here rather than on a settings page — anything
 * that sends a user away mid-flow is where they stop. Tokens are stored
 * hashed, so a returning user gets the command with a placeholder and the
 * option to mint a fresh one.
 */
export default function ConnectBox({
  slug,
  hasToken,
}: {
  slug: string;
  hasToken: boolean;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3300";
  const secret = token ?? "YOUR_TOKEN";
  const command = `claude mcp add --transport http mozg ${base}/mcp --header "Authorization: Bearer ${secret}"`;

  async function copy() {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const yellow = {
    background: copied ? "var(--color-riso-green)" : "var(--color-riso-yellow)",
    color: "var(--ink)",
    borderColor: copied ? "var(--color-riso-green)" : "var(--color-riso-yellow)",
  };

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

      {token ? (
        <>
          <button className="btn" onClick={copy} style={yellow}>
            {copied ? "Copied" : "Copy command"}
          </button>
          <div className="c" style={{ marginTop: ".75rem" }}>
            copy it now — the token is stored hashed and cannot be shown again
          </div>
        </>
      ) : hasToken ? (
        <>
          <button className="btn" onClick={copy} style={yellow}>
            {copied ? "Copied" : "Copy command"}
          </button>
          <div className="c" style={{ marginTop: ".75rem" }}>
            paste your token over YOUR_TOKEN, or{" "}
            <button
              onClick={() => start(async () => setToken((await createTokenInline()).token))}
              disabled={pending}
              style={{
                background: "none",
                border: 0,
                padding: 0,
                color: "var(--color-riso-yellow)",
                font: "inherit",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              {pending ? "making one…" : "make a new one"}
            </button>
          </div>
        </>
      ) : (
        <button
          className="btn"
          style={yellow}
          disabled={pending}
          onClick={() => start(async () => setToken((await createTokenInline()).token))}
        >
          {pending ? "Creating…" : "Create token and show command"}
        </button>
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
