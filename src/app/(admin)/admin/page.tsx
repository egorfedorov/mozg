import type { Metadata } from "next";
import AdminClient from "@/admin/AdminClient";

export const metadata: Metadata = {
  title: "Operator",
  description: "The panel of the person behind mozg.",
  // The panel is reached by a link sent to one address. A search index has no business there.
  robots: { index: false, follow: false, nocache: true },
};

/** The operator's panel: the chat, the errors, the announcements, the drafts. Opened by a link sent to one address. */
export default function AdminPage() {
  return <AdminClient />;
}
