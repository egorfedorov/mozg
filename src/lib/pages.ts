/**
 * The public side of the site, as a list, and who gets the machine view.
 *
 * Kept free of imports on purpose: both halves of the machine view read it —
 * the document, built on the server, and the switch, which runs in the
 * browser and must not drag the environment or the database in behind it.
 */

/**
 * Where the browser splices the current page into the document lib/machine.ts
 * builds. It lives here rather than there because both halves need it and this
 * is the half that is safe to import in a browser — lib/machine.ts reads the
 * environment, which throws the moment it is evaluated client-side.
 */
export const CURRENT_PAGE_MARKER = "{{current-page}}";

/** Every page a stranger (or their agent) can open, with what it is for. */
export const PAGES: { path: string; what: string }[] = [
  { path: "/", what: "what mozg is, in one screen" },
  { path: "/start", what: "the guided path — ten minutes to a connected agent" },
  { path: "/basics", what: "the vocabulary: brain, note, source, exam, MCP" },
  { path: "/why", what: "why a brain beats a context file" },
  { path: "/vs", what: "brain vs context file, including when the file wins" },
  { path: "/vs-skills", what: "brain vs skills and other static knowledge files" },
  { path: "/guide", what: "the long guide, including the common mistakes" },
  { path: "/connect", what: "the config for each MCP client" },
  { path: "/make", what: "build a brain from one link" },
  { path: "/explore", what: "the public catalogue, searchable" },
  { path: "/collective", what: "how every reader makes a brain smarter" },
  { path: "/pricing", what: "plans and what each one includes" },
  { path: "/stories", what: "what people built and what it cost them" },
  { path: "/changelog", what: "what shipped, when" },
  { path: "/roadmap", what: "what is being built next" },
  { path: "/status", what: "live health of the service" },
  { path: "/about", what: "who makes this and why" },
  { path: "/terms", what: "terms of service" },
  { path: "/privacy", what: "privacy policy" },
  { path: "/cookies", what: "cookie policy" },
];

/**
 * The workspace, where the machine view does not belong.
 *
 * A deny list rather than an allow list: the sheet describes the product, so a
 * marketing page added next month should carry it without anyone remembering
 * to add it, while a signed-in working screen — where the reader is doing a
 * job, not evaluating us — should not.
 */
const PRIVATE = [
  "/admin",
  "/brains",
  "/settings",
  "/chat",
  "/learn",
  "/gallery/mine",
  "/sign-in",
  "/welcome",
  "/pay",
  "/gift",
  "/styles/new",
];

export function hasMachineView(path: string): boolean {
  // Badges are embedded in other people's READMEs the way an image is —
  // a floating switch on top of one is nonsense.
  if (path.endsWith("/badge")) return false;
  return !PRIVATE.some((p) => path === p || path.startsWith(`${p}/`));
}
