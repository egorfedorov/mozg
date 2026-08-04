"use client";

import { signOut } from "@/lib/auth-client";

/** The way out. Lives at the bottom of the rail; lands on the landing page
    signed out, with the wide .mozg.sh cookie cleared for both hosts. */
export default function SignOutLink() {
  return (
    // An anchor, not <Link>, and not a <button>: the rail styles `.app-nav a`,
    // and the reload this ends with is the point — it drops every piece of
    // client state belonging to the session that just ended.
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a
      href="/"
      onClick={(e) => {
        e.preventDefault();
        void signOut().finally(() => {
          window.location.href = "/";
        });
      }}
      style={{ cursor: "pointer" }}
    >
      Sign out
    </a>
  );
}
