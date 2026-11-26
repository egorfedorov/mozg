"use client";

import { useEffect, useRef, useState } from "react";
import { msg, t } from "@/lib/i18n";

/**
 * Puts text on the clipboard and says so.
 *
 * The product keeps asking a person to carry one line somewhere else: a command
 * into Claude Code, a prompt into their agent, a recap into a journal. A button
 * that fails silently at that is worse than no button.
 */
export default function CopyButton({
  text,
  label,
  copied,
  className = "btn btn-sm",
  onCopied,
}: {
  text: string;
  label: string;
  copied?: string;
  className?: string;
  onCopied?: () => void;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
      onCopied?.();
    } catch {
      // No clipboard permission (plain HTTP on another host, an old browser).
      setState("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2400);
  };

  return (
    <button type="button" className={className} onClick={() => void copy()}>
      {state === "copied" ? t(copied ?? msg("Copied")) : state === "failed" ? t("Could not copy") : label}
    </button>
  );
}
