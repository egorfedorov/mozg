"use client";

import Link from "next/link";
import { useState } from "react";
import { renderSnippet, type Client } from "@/lib/clients";

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

  const client = clients.find((c) => c.id === active) ?? clients[0];
  // Never a real token here: this page is public, and a token is shown exactly
  // once, on the brain it was made for.
  const snippet = renderSnippet(client, url, "YOUR_TOKEN");

  async function copy() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

          <button
            className="btn"
            onClick={copy}
            style={{
              marginTop: "1rem",
              background: copied ? "var(--color-riso-green)" : "var(--color-riso-yellow)",
              color: "var(--ink)",
              borderColor: copied ? "var(--color-riso-green)" : "var(--color-riso-yellow)",
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>

          <div className="c" style={{ marginTop: ".9rem" }}>
            replace YOUR_TOKEN —{" "}
            {signedIn ? (
              <Link href="/settings/tokens" style={{ textDecoration: "underline" }}>
                make one here
              </Link>
            ) : (
              <Link href="/sign-in" style={{ textDecoration: "underline" }}>
                sign in to make one
              </Link>
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
