import { machineDoc } from "@/lib/machine";
import { CURRENT_PAGE_MARKER } from "@/lib/pages";

// Same reason as llms.txt: rendered per request rather than baked at build,
// so a self-hosted instance answers with its own address.
export const dynamic = "force-dynamic";

/**
 * The Machine view, as a URL.
 *
 * Every public page already ships the sheet in its markup, which is enough for
 * anything reading HTML — but the readability extractors most agent stacks put
 * in front of a page (r.jina.ai and its kind) drop elements marked `hidden`
 * before the model ever sees them, so half of our machine readers were getting
 * the prose we wrote for humans. A plain-text route has nothing to extract.
 *
 * Discoverable from the <head> of every page as rel="alternate", so an agent
 * that fetched a page can find this without being told it exists.
 */
export function GET(): Response {
  const current = [
    "# current-page",
    "path  /machine.txt",
    "what  this document; every page carries it behind the Machine switch",
  ].join("\n");

  return new Response(machineDoc().replace(CURRENT_PAGE_MARKER, current), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
