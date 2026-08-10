"use client";

import { useEffect } from "react";

/**
 * The browser tells on itself. Three reports per page load at most — after
 * that a broken page stays broken quietly rather than DDoSing the report
 * endpoint with its own death rattle.
 */
export default function ClientErrorReporter() {
  useEffect(() => {
    let budget = 3;
    const send = (message: string, stack?: string) => {
      if (budget-- <= 0) return;
      void fetch("/api/client-error", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, stack, url: location.pathname }),
        keepalive: true,
      }).catch(() => {});
    };
    // A cross-origin throw arrives with no Error object; its filename is then
    // the only thing naming where it came from.
    const onError = (e: ErrorEvent) =>
      send(e.message, e.error?.stack ?? (e.filename ? `at ${e.filename}` : undefined));
    const onReject = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      send(r instanceof Error ? r.message : String(r), r instanceof Error ? r.stack : undefined);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onReject);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onReject);
    };
  }, []);
  return null;
}
