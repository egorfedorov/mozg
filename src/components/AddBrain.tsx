"use client";

import Link from "next/link";
import { useActionState } from "react";
import { addBrain } from "@/app/b/[handle]/[slug]/library-action";
import { useT } from "@/lib/t-client";
import { markup } from "@/lib/markup";

/**
 * The step the catalogue was missing. Browsing showed brains an agent could
 * never reach, because nothing put them in the list brain_list returns.
 */
export default function AddBrain({
  brainId,
  handle,
  signedIn,
  added,
}: {
  brainId: string;
  /** owner/slug, so the confirmation can say what to tell the agent. */
  handle: string;
  signedIn: boolean;
  added: boolean;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(addBrain, null);
  const isAdded = added || state?.ok;

  if (!signedIn) {
    return (
      <div className="panel">
        <p className="eyebrow">{t("Or just add it")}</p>
        <p style={{ color: "var(--ink-2)", margin: ".5rem 0 1rem" }}>
          {t(
            "Sign in and add it, and every agent you have connected can read it — nothing to download, and it stays current as the author updates it.",
          )}
        </p>
        <Link className="btn" href="/sign-in">
          {t("Sign in to add it")}
        </Link>
      </div>
    );
  }

  if (isAdded) {
    return (
      <div className="panel" style={{ borderLeft: "4px solid var(--color-riso-green)" }}>
        <p className="eyebrow">{t("In your brains")}</p>
        <p style={{ margin: ".5rem 0 0" }}>
          {markup(
            t(
              "Your agents can read it now. Ask yours to <0/>, or let it find the brain itself with <1/>.",
            ),
            [
              <code className="mono" key="s0">
                use {handle}
              </code>,
              <code className="mono" key="s1">
                brain_list
              </code>,
            ],
          )}
        </p>
        <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", marginTop: ".75rem" }}>
          {markup(t("<0/> · remove it any time from your brains"), [
            state?.already ? t("it was already there") : t("added"),
          ])}
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="panel">
      <input type="hidden" name="brainId" value={brainId} />
      <p className="eyebrow">{t("Or just add it")}</p>
      <p style={{ color: "var(--ink-2)", margin: ".5rem 0 1rem" }}>
        {t(
          "Adding it puts it in the list your agents read. It is not copied to your machine — it stays with its author and keeps improving as they add to it.",
        )}
      </p>
      {state?.error && (
        <p className="mono" style={{ color: "var(--color-riso-red)", fontSize: ".8125rem" }}>
          {state.error}
        </p>
      )}
      <button className="btn" disabled={pending}>
        {pending ? t("Adding…") : t("Add to my brains")}
      </button>
    </form>
  );
}
