/**
 * Did this throw come from a browser extension rather than from the page?
 *
 * A geo-spoofing extension patching page code threw "cleanup" on /brains and
 * filled the error center with a stack whose top frame is a bundle we do not
 * ship — unfixable from here, and it buries the errors that are ours. Only the
 * topmost frame counts: an extension appearing further down means our code
 * called into it, which is still our stack to look at.
 *
 * Applied server-side, not in the reporter, so a browser running last week's
 * cached bundle is filtered too.
 */
export function fromExtension(stack?: string | null): boolean {
  // The first line carrying a URL is the top frame in both stack dialects —
  // Chrome's "  at k (url)" under a message header, Firefox's "k@url" with none.
  const top = stack?.split("\n").find((l) => l.includes("://"));
  return !!top && /\w+-extension:\/\//.test(top);
}
