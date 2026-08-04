/**
 * Analytics. PostHog, and only when NEXT_PUBLIC_POSTHOG_KEY exists: without a
 * key every call here is a no-op, so the app runs identically with analytics
 * off — no client bundle, no server requests, nothing in the console.
 *
 * Server events go over plain HTTPS to the capture API instead of posthog-node:
 * a handful of events does not justify a dependency. The public env vars are
 * read straight from process.env (not lib/env.ts) so this file stays importable
 * from anywhere — including auth.ts, which the better-auth CLI loads outside
 * the Next resolver.
 */

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = (process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com").replace(
  /\/+$/,
  "",
);

export const analyticsReady = Boolean(KEY);

/**
 * Record a server-side event. Fire-and-forget: analytics must never break,
 * delay, or fail the action it measures, so the promise is dropped and any
 * error is swallowed.
 */
export function captureServer(
  distinctId: string,
  event: string,
  properties: Record<string, unknown> = {},
): void {
  if (!KEY) return;
  void fetch(`${HOST}/capture/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: KEY,
      event,
      distinct_id: distinctId,
      properties,
    }),
  }).catch(() => {});
}
