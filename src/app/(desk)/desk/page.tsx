import type { Metadata } from "next";
import DeskClient from "./DeskClient";

export const metadata: Metadata = {
  title: "Desk",
  description: "What you can vouch for in the code your agent wrote today.",
  // A page about one person's own machine has no business in a search index.
  robots: { index: false, follow: false },
};

/** The local desk. Everything on it is fetched from the mozg server on 127.0.0.1. */
export default function DeskPage() {
  return <DeskClient />;
}
