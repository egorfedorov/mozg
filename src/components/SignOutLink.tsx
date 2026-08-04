"use client";

import { signOut } from "@/lib/auth-client";

/** The way out. Lives at the bottom of the rail; lands on the landing page
    signed out, with the wide .mozg.sh cookie cleared for both hosts. */
export default function SignOutLink() {
  return (
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
