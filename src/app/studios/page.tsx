import { permanentRedirect } from "next/navigation";

/**
 * /studios was the first pack's page before packs existed as an idea. It was
 * live and linked, so it keeps working — a 308 to where it moved rather than a
 * 404 with our own name on it.
 */
export default function StudiosPage() {
  permanentRedirect("/packs/igaming");
}
