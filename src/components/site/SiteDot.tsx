"use client";

import { useEffect, useState } from "react";
import { call } from "./api";

/**
 * Whether the site's own server answers: one dot in the footer. Asked once,
 * never again: a page that is open is not a monitor.
 */
export default function SiteDot({ up, down }: { up: string; down: string }) {
  const [state, setState] = useState<"asking" | "up" | "down">("asking");
  useEffect(() => {
    void call("GET", "/api/health").then((answer) => setState(answer.ok ? "up" : "down"));
  }, []);
  if (state === "asking") return <span className="sitedot" data-state="asking" />;
  return (
    <span className="sitedot-wrap">
      <span className="sitedot" data-state={state} aria-hidden="true" />
      <span className="sr-only">{state === "up" ? up : down}</span>
    </span>
  );
}
