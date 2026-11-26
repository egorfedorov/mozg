"use client";

import { useEffect } from "react";
import { call } from "./api";

/**
 * The browser tells on itself: a throw on a page of the site is filed in the
 * operator's panel. Three reports per page load at most, so a page that is
 * broken in a loop stays quietly broken rather than burying the panel.
 *
 * Only the public pages. The plugin's desk never reports anywhere: nothing on
 * a person's machine tells this server it exists.
 */
export default function ClientErrorReporter() {
  useEffect(() => {
    let budget = 3;
    const send = (message: string, stack?: string) => {
      if (budget-- <= 0) return;
      void call("POST", "/api/report", { message, stack, url: location.pathname }).catch(() => {});
    };
    // A cross-origin throw arrives with no Error object; its file is then the only thing naming it.
    const onError = (event: ErrorEvent) => send(event.message, event.error?.stack ?? (event.filename ? `at ${event.filename}` : undefined));
    const onReject = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      send(reason instanceof Error ? reason.message : String(reason), reason instanceof Error ? reason.stack : undefined);
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
