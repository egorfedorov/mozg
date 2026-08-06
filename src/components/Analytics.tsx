"use client";

import { useEffect } from "react";
import { useConsent } from "@/components/useConsent";

/**
 * PostHog on the client, only when a key is configured and only after the
 * visitor has said yes. Without either, this renders nothing and loads
 * nothing — analytics is optional infrastructure, not a requirement to boot
 * the app, and consent is not a box we tick on someone's behalf.
 *
 * The library itself is a dynamic import, so an undecided or opted-out visitor
 * never downloads it at all. That is the difference between honouring a choice
 * and loading a tracker with its hands tied.
 *
 * Withdrawal is handled too: flipping analytics off fires the consent event,
 * and opt_out_capturing() silences the already-loaded instance. It cannot be
 * un-imported, but it can be made to stop.
 */
export default function Analytics() {
  const consent = useConsent();

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || !consent) return;

    let mounted = true;
    void import("posthog-js")
      .then(({ default: posthog }) => {
        if (!mounted) return;
        if (!consent.analytics) {
          if (posthog.__loaded) posthog.opt_out_capturing();
          return;
        }
        if (posthog.__loaded) {
          posthog.opt_in_capturing();
          return;
        }
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
  }, [consent]);

  return null;
}
