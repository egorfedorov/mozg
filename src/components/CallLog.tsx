"use client";

import { useT } from "@/lib/t-client";
import { useEffect, useRef, useState } from "react";
import { fill } from "@/lib/markup";

/**
 * Watching an agent actually reach into the brain is the moment the product
 * stops being abstract. Cheap to build, and it answers "is this thing doing
 * anything?" better than any dashboard number.
 */

interface Call {
  id: string;
  tool: string;
  query: string | null;
  results: number | null;
  latency_ms: number | null;
  ok: boolean;
  created_at: string;
}

const MAX_LINES = 40;

/**
 * Timestamps arrive as ISO UTC and are shown in the reader's local time.
 *
 * `hour12: false` is load-bearing: without it Node renders `10:00:56` and the
 * browser renders `10:00:56 AM`, and React tears down the whole subtree over
 * the mismatch. suppressHydrationWarning covers the other half of the problem —
 * in production the server runs in UTC and the reader does not, so the first
 * paint legitimately differs from the hydrated one.
 */
function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function CallLog({
  brainId,
  recent,
}: {
  brainId: string;
  /** Server-rendered history, so the panel is never empty on first paint. */
  recent: Call[];
}) {
  const t = useT();

  const [calls, setCalls] = useState<Call[]>(recent);
  const [live, setLive] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  // Follow the tail only while the reader is already at it — yanking the
  // scroll on every call makes the history above unreadable.
  const atBottom = useRef(true);

  useEffect(() => {
    const source = new EventSource(`/api/brains/${brainId}/calls/stream`);

    source.addEventListener("ready", () => setLive(true));
    source.addEventListener("call", (e) => {
      const call = JSON.parse((e as MessageEvent).data) as Call;
      setCalls((prev) =>
        // Dedupe by id: the server-rendered history and the stream can overlap,
        // and React's dev double-mount opens the connection twice. Without this
        // the same call renders under a duplicate key.
        prev.some((c) => c.id === call.id)
          ? prev
          : [...prev, call].slice(-MAX_LINES),
      );
    });
    source.addEventListener("bye", () => {
      setLive(false);
      source.close();
    });
    source.onerror = () => setLive(false);

    return () => source.close();
  }, [brainId]);

  useEffect(() => {
    if (atBottom.current) bottom.current?.scrollIntoView({ block: "nearest" });
  }, [calls.length]);

  return (
    <section
      className="term"
      style={{ maxHeight: 340, overflowY: "auto" }}
      aria-live="polite"
      aria-label={t("Agent call log")}
      onScroll={(e) => {
        const el = e.currentTarget;
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
    >
      <div className="term-bar" style={{ position: "sticky", top: 0, background: "var(--ink)" }}>
        <span
          className="term-dot"
          style={{ background: live ? "var(--color-riso-green)" : "#3a3f47" }}
        />
        <span className="term-dot" />
        <span className="term-dot" />
        <span style={{ marginLeft: ".5rem" }}>
          {live ? t("live · agent calls") : t("agent calls")}
        </span>
      </div>

      {calls.length === 0 ? (
        <div className="c">
          {t("Nothing yet. Connect an agent and ask it something that needs this brain — calls appear here as they happen.")}</div>
      ) : (
        calls.map((call) => (
          <div key={call.id} style={{ display: "flex", gap: ".75rem" }}>
            <span className="c" style={{ flexShrink: 0 }} suppressHydrationWarning>
              {clock(call.created_at)}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className={call.ok ? "k" : ""} style={!call.ok ? { color: "#f15060" } : undefined}>
                {call.tool}
              </span>
              {call.query && (
                <span className="t">
                  (&quot;{call.query.length > 60 ? `${call.query.slice(0, 60)}…` : call.query}&quot;)
                </span>
              )}
              <span className="c">
                {call.results !== null && fill(t(" → <0/> notes"), [call.results])}
                {call.latency_ms !== null && fill(t(" · <0/> ms"), [call.latency_ms])}
                {!call.ok && t(" · failed")}
              </span>
            </span>
          </div>
        ))
      )}
      <div ref={bottom} />
    </section>
  );
}
