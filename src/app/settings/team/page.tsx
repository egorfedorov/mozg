import { permanentRedirect } from "next/navigation";

/** Renamed once the shelf became packs rather than one studio. */
export default function TeamPage() {
  permanentRedirect("/settings/packs");
}
