"use client";

import { useState } from "react";
import { useT } from "@/lib/t-client";
import { fill } from "@/lib/markup";

/**
 * The whole triage page as plain text, on the clipboard.
 *
 * Every incident here ends the same way: the operator selects a stack trace by
 * hand, misses the timestamp above it, and pastes half a picture into an agent.
 * The page already knows the full picture — grouped, counted, with the traces
 * attached — so it hands it over in one press.
 *
 * The text is built on the server and passed in whole: this component must not
 * re-derive what the page renders, or the paste and the screen drift apart.
 */
export default function CopyErrors({ text, count }: { text: string; count: number }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="btn btn-ghost"
      style={{ padding: ".4rem .8rem" }}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }}
    >
      {copied
        ? fill(t("copied ✓ — <0/> rows, paste it to an agent"), [count])
        : t("Copy errors")}
    </button>
  );
}
