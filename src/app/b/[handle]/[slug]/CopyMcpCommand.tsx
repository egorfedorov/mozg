"use client";

import { useState } from "react";

/**
 * One click puts the whole connect command on the clipboard — the person
 * Discord sent here should not have to select text inside a fake terminal.
 */
export default function CopyMcpCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(command).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        });
      }}
      className="mono"
      style={{
        marginTop: "1rem",
        padding: ".45rem .9rem",
        background: copied ? "var(--color-riso-green)" : "transparent",
        color: copied ? "var(--ink)" : "#e6e8ea",
        border: "1.5px solid #6d747e",
        cursor: "pointer",
        fontSize: ".8125rem",
      }}
    >
      {copied ? "copied ✓" : "copy command"}
    </button>
  );
}
