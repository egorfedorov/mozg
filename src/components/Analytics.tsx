"use client";

import { useEffect } from "react";

/**
 * PostHog on the client, only when a key is configured. Without one this
 * renders nothing and loads nothing — analytics is optional infrastructure,
 * not a requirement to boot the app. The library itself is a dynamic import,
 * so the bundle only pays for it when it can actually be used.
 */
export default function Analytics() {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;

    let mounted = true;
    void import("posthog-js")
      .then(({ default: posthog }) => {
        if (!mounted || posthog.__loaded) return;
        posthog.init(key, {
          api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
          // The App Router does no full page loads after the first, so
          // automatic pageviews would report one view per session and call it
          // a day. Off until a route-change listener earns its keep; the
          // funnel events (signup → first search) are captured server-side.
          capture_pageview: false,
        });
      })
      .catch(() => {
        // Analytics must never break the app it measures.
      });

    return () => {
      mounted = false;
    };
  }, []);

  return null;
}
