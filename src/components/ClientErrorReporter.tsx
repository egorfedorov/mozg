"use client";

import { useEffect } from "react";
import { fromStaleDeploy } from "@/lib/client-error";

/** One reload per tab, so a release cannot become a refresh loop. */
const STALE_KEY = "mozg:reloaded-after-deploy";

/**
 * The browser tells on itself. Three reports per page load at most — after
 * that a broken page stays broken quietly rather than DDoSing the report
 * endpoint with its own death rattle.
 */
export default function ClientErrorReporter() {
  useEffect(() => {
    let budget = 3;
    const send = (message: string, stack?: string) => {
      // The page was open when we deployed, so its server actions post ids the
      // new server has never heard of and every click silently does nothing.
      // Reloading is the fix and the user cannot know to do it — but only once
      // per page, or a release turns into a refresh loop.
      if (fromStaleDeploy(message)) {
        // Guarded: a private window or blocked site data makes the accessor
        // itself throw, and this is an error handler — throwing here would
        // turn one stale click into an unhandled rejection loop.
        try {
          if (!sessionStorage.getItem(STALE_KEY)) {
            sessionStorage.setItem(STALE_KEY, "1");
            location.reload();
          }
        } catch {
          // No memory of a previous reload, so do nothing rather than risk one
          // on every throw.
        }
        return;
      }
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
