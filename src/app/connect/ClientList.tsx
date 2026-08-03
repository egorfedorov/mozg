"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { renderSnippet, type Client } from "@/lib/clients";
import { mintToken } from "./token-action";

const FAMILY_LABEL: Record<Client["family"], string> = {
  cli: "Terminal",
  editor: "Editor",
  desktop: "Desktop",
};

export default function ClientList({
  clients,
  url,
  signedIn,
}: {
  clients: Client[];
  url: string;
  signedIn: boolean;
}) {
  const [active, setActive] = useState(clients[0].id);
  const [copied, setCopied] = useState(false);
  // Filled in only when the reader asks for it, and only in their own browser.
  // Signed out, the page is public and the placeholder is the whole point.
  const [token, setToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [minting, startMint] = useTransition();

  const client = clients.find((c) => c.id === active) ?? clients[0];
  const snippet = renderSnippet(client, url, token ?? "YOUR_TOKEN");

  async function copy() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function makeToken() {
    setTokenError(null);
    startMint(async () => {
      const res = await mintToken();
      if ("error" in res) setTokenError(res.error);
      else setToken(res.token);
    });
  }

  const families = ["cli", "editor", "desktop"] as const;

  return (
    <section style={{ marginTop: "2.5rem" }}>
      <div style={{ display: "grid", gap: "1.25rem" }}>
        {families.map((family) => {
          const inFamily = clients.filter((c) => c.family === family);
          if (!inFamily.length) return null;
          return (
            <div key={family}>
              <p className="eyebrow" style={{ marginBottom: ".5rem" }}>
                {FAMILY_LABEL[family]}
              </p>
              <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
                {inFamily.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setActive(c.id);
                      setCopied(false);
                    }}
                    className="tag"
                    style={{
                      cursor: "pointer",
                      padding: ".45rem .7rem",
                      background: c.id === active ? "var(--ink)" : "transparent",
                      color: c.id === active ? "var(--paper-2)" : "var(--ink)",
                      borderColor: "var(--ink)",
                      fontSize: ".8125rem",
                    }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: "1.5rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "1rem",
            flexWrap: "wrap",
            marginBottom: ".6rem",
          }}
        >
          <span className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>
            {client.path ?? `${client.name} · run this`}
          </span>
          <a
            className="navlink"
            href={client.docs}
            target="_blank"
            rel="noreferrer noopener"
            style={{ fontSize: ".75rem" }}
          >
            {client.name} docs ↗
          </a>
        </div>

        <section className="term">
          <div className="term-bar">
            <span className="term-dot" />
            <span className="term-dot" />
            <span className="term-dot" />
            <span style={{ marginLeft: ".5rem" }}>
              {client.name} · {client.vendor}
            </span>
          </div>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              font: "inherit",
            }}
          >
            {snippet}
          </pre>

          <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", marginTop: "1rem" }}>
            <button
              className="btn"
              onClick={copy}
              style={{
                background: copied ? "var(--color-riso-green)" : "var(--color-riso-yellow)",
                color: "var(--ink)",
                borderColor: copied ? "var(--color-riso-green)" : "var(--color-riso-yellow)",
              }}
            >
              {copied ? "Copied" : token ? "Copy — ready to run" : "Copy"}
            </button>

            {signedIn && !token && (
              <button
                className="btn"
                onClick={makeToken}
                disabled={minting}
                style={{
                  background: "transparent",
                  color: "var(--paper)",
                  borderColor: "var(--paper)",
                }}
              >
                {minting ? "Making…" : "Make a token and fill it in"}
              </button>
            )}
          </div>

          {tokenError && (
            <div className="c" style={{ marginTop: ".9rem", color: "#f15060" }}>
              {tokenError}
            </div>
          )}

          <div className="c" style={{ marginTop: ".9rem" }}>
            {token ? (
              <>
                token filled in — this is the only time it is shown. It is also on{" "}
                <Link href="/settings/tokens" style={{ textDecoration: "underline" }}>
                  your tokens page
                </Link>{" "}
                as {token.slice(0, 12)}…, where you can revoke it.
              </>
            ) : signedIn ? (
              <>
                replace YOUR_TOKEN, or press the button and we will —{" "}
                <Link href="/settings/tokens" style={{ textDecoration: "underline" }}>
                  all your tokens
                </Link>
              </>
            ) : (
              <>
                replace YOUR_TOKEN —{" "}
                <Link href="/sign-in" style={{ textDecoration: "underline" }}>
                  sign in to make one
                </Link>
              </>
            )}
          </div>
        </section>

        {client.note && (
          <p
            style={{
              marginTop: ".85rem",
              color: "var(--ink-2)",
              fontSize: ".9375rem",
              maxWidth: "62ch",
            }}
          >
            {client.note}
          </p>
        )}
      </div>
    </section>
  );
}
