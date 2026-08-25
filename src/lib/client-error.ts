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

/**
 * A page that was open when we deployed.
 *
 * Next gives every server action an id derived from the build, so a tab left
 * open across a release posts an id the new server has never heard of and the
 * user's click does nothing at all. It is not a fault in our code and there is
 * nothing to fix in it — but it is also not harmless the way an extension's
 * throw is, because somebody pressed a button and got silence.
 *
 * So it is recognised in two places for two different reasons: here, so it
 * stops being filed as a fresh failure and paging the operator after every
 * deploy, and in the reporter, which reloads the page so the next click works.
 */
export function fromStaleDeploy(message?: string | null): boolean {
  return !!message && /Server Action "[^"]*" was not found on the server/.test(message);
}
