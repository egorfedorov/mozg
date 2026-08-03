"use client";

import { useActionState } from "react";
import type { Brain, Grant } from "@/db/types";
import { updateSharing, inviteByEmail, removeGrant } from "./actions";

const VISIBILITY = [
  {
    value: "private",
    label: "Private",
    detail: "Only you. Your agents reach it with your token.",
  },
  {
    value: "link",
    label: "Shared",
    detail: "People you invite by email below. Not listed anywhere.",
  },
  {
    value: "public",
    label: "Public",
    detail: "Anyone can read it, and it gets a page search engines can find.",
  },
] as const;

const LICENSES = [
  {
    value: "nc",
    label: "CC BY-NC-SA 4.0",
    detail: "Copy, change and share with credit. Selling it is not allowed.",
  },
  {
    value: "mit",
    label: "MIT",
    detail: "Anything goes, including reselling it inside a paid product.",
  },
  {
    value: "proprietary",
    label: "Closed",
    detail: "Readable over MCP only. Export is switched off for everyone but you.",
  },
] as const;

export default function ShareForm({
  brain,
  grants,
}: {
  brain: Brain;
  grants: Grant[];
}) {
  const [settings, saveSettings, savingSettings] = useActionState(updateSharing, null);
  const [invite, sendInvite, inviting] = useActionState(inviteByEmail, null);

  return (
    <>
      <form action={saveSettings} className="panel" style={{ display: "grid", gap: "2rem" }}>
        <input type="hidden" name="slug" value={brain.slug} />

        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: ".75rem" }}>
          <legend className="eyebrow" style={{ padding: 0 }}>
            Who can read it
          </legend>
          {VISIBILITY.map((v) => (
            <Radio
              key={v.value}
              name="visibility"
              value={v.value}
              defaultChecked={brain.visibility === v.value}
              label={v.label}
              detail={v.detail}
            />
          ))}
        </fieldset>

        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: ".75rem" }}>
          <legend className="eyebrow" style={{ padding: 0 }}>
            Licence
          </legend>
          <p style={{ margin: "0 0 .25rem", color: "var(--ink-2)", fontSize: ".9375rem" }}>
            A licence is a legal boundary, not a technical one. Anyone who can read a
            brain can copy it — what keeps a shared brain worth subscribing to is that
            you keep updating it.
          </p>
          {LICENSES.map((l) => (
            <Radio
              key={l.value}
              name="license"
              value={l.value}
              defaultChecked={brain.license === l.value}
              label={l.label}
              detail={l.detail}
            />
          ))}
        </fieldset>

        <label style={{ display: "flex", gap: ".6rem", alignItems: "flex-start" }}>
          <input
            type="checkbox"
            name="review_required"
            defaultChecked={brain.review_required}
            style={{ marginTop: ".25rem" }}
          />
          <span>
            <strong>Review notes written by agents</strong>
            <span style={{ display: "block", color: "var(--ink-2)", fontSize: ".9375rem" }}>
              Agent-written notes wait for your approval before they can be found by
              search. Turn this off and they go straight in.
            </span>
          </span>
        </label>

        {settings?.error && (
          <p className="mono" style={{ color: "var(--color-riso-red)", fontSize: ".8125rem", margin: 0 }}>
            {settings.error}
          </p>
        )}
        {settings?.ok && (
          <p className="mono" style={{ color: "var(--color-riso-green)", fontSize: ".8125rem", margin: 0 }}>
            Saved
          </p>
        )}

        <div>
          <button className="btn" disabled={savingSettings}>
            {savingSettings ? "Saving…" : "Save"}
          </button>
        </div>
      </form>

      <section style={{ marginTop: "2rem" }}>
        <h2 className="display" style={{ fontSize: "1.5rem", marginBottom: ".75rem" }}>
          People
        </h2>

        <p style={{ color: "var(--ink-2)", marginTop: 0, fontSize: ".9375rem", maxWidth: "58ch" }}>
          Access is granted to the address, and only once that address is proven
          — signing in with GitHub proves it. Until then the invitation sits here
          and grants nothing.
        </p>

        <form action={sendInvite} style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
          <input type="hidden" name="slug" value={brain.slug} />
          <input
            name="email"
            type="email"
            required
            placeholder="teammate@example.com"
            style={{
              flex: 1,
              minWidth: 220,
              padding: ".7rem .85rem",
              border: "1.5px solid var(--ink)",
              background: "var(--paper-2)",
              font: "inherit",
            }}
          />
          <select
            name="role"
            defaultValue="viewer"
            style={{
              padding: ".7rem .85rem",
              border: "1.5px solid var(--ink)",
              background: "var(--paper-2)",
              font: "inherit",
            }}
          >
            <option value="viewer">can read</option>
            <option value="contributor">can read and write</option>
          </select>
          <button className="btn" disabled={inviting}>
            {inviting ? "Adding…" : "Add"}
          </button>
        </form>

        {invite?.error && (
          <p className="mono" style={{ color: "var(--color-riso-red)", fontSize: ".8125rem" }}>
            {invite.error}
          </p>
        )}

        {grants.length > 0 && (
          <div className="panel" style={{ padding: 0, marginTop: "1rem" }}>
            {grants.map((g) => (
              <div
                key={g.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  gap: "1rem",
                  alignItems: "center",
                  padding: ".7rem 1.25rem",
                  borderBottom: "1px solid var(--rule)",
                }}
              >
                <span>{g.email}</span>
                <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)" }}>
                  {g.role === "contributor" ? "read + write" : "read"}
                  {!g.accepted_by && " · has not signed in yet"}
                </span>
                <form action={removeGrant}>
                  <input type="hidden" name="id" value={g.id} />
                  <input type="hidden" name="slug" value={brain.slug} />
                  <button
                    className="mono"
                    style={{
                      background: "none",
                      border: 0,
                      padding: 0,
                      color: "var(--color-riso-red)",
                      fontSize: ".8125rem",
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    remove
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function Radio({
  name,
  value,
  defaultChecked,
  label,
  detail,
}: {
  name: string;
  value: string;
  defaultChecked: boolean;
  label: string;
  detail: string;
}) {
  return (
    <label style={{ display: "flex", gap: ".6rem", alignItems: "flex-start" }}>
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        style={{ marginTop: ".3rem" }}
      />
      <span>
        <strong>{label}</strong>
        <span style={{ display: "block", color: "var(--ink-2)", fontSize: ".9375rem" }}>
          {detail}
        </span>
      </span>
    </label>
  );
}
