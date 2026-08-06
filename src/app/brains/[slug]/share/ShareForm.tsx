"use client";

import { useActionState } from "react";
import type { Brain, Grant } from "@/db/types";
// money-math, not money: this is a client component and @/lib/money drags in pg.
import { PLATFORM_FEE_PERCENT } from "@/lib/money-math";
import { TOPICS } from "@/lib/topics";
import { updateSharing, inviteByEmail, removeGrant, uploadCover } from "./actions";
import { coverUrl } from "@/lib/covers";

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
  const [cover, saveCover, savingCover] = useActionState(uploadCover, null);
  const existingCover = coverUrl(brain);

  return (
    <>
      {/* Its own form, outside the settings one: a file input inside the
          settings form would re-upload the image on every unrelated save, and
          nested forms are not a thing. The fieldset below targets it by id. */}
      <form id="cover-form" action={saveCover} style={{ display: "none" }}>
        <input type="hidden" name="slug" value={brain.slug} />
      </form>
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

        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: ".5rem" }}>
          <legend className="eyebrow" style={{ padding: 0 }}>
            Field
          </legend>
          <p style={{ margin: "0 0 .25rem", color: "var(--ink-2)", fontSize: ".9375rem" }}>
            Which shelf of the catalogue it sits on. Only matters once it is public.
          </p>
          <select
            name="topic"
            defaultValue={brain.topic}
            style={{
              padding: ".55rem .7rem",
              border: "1.5px solid var(--ink)",
              background: "var(--paper)",
              font: "inherit",
              maxWidth: 320,
            }}
          >
            {TOPICS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </fieldset>

        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: ".5rem" }}>
          <legend className="eyebrow" style={{ padding: 0 }}>
            Price
          </legend>
          <p style={{ margin: "0 0 .25rem", color: "var(--ink-2)", fontSize: ".9375rem" }}>
            Leave at 0 to keep it free. A paid brain is listed publicly with its
            note titles visible, and the contents unlock when someone buys it.
            Paid once — buyers keep access as you keep adding to it. You receive{" "}
            {100 - PLATFORM_FEE_PERCENT}% of each sale.
          </p>
          <p
            className="mono"
            style={{ margin: "0 0 .5rem", fontSize: ".75rem", color: "var(--ink-3)", maxWidth: "58ch" }}
          >
            Sell only what is yours to sell. Upload work you made, or that you
            hold a licence for — a brain built from someone else&apos;s material
            is taken down, and selling it is theft with extra steps.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
            <span className="mono" style={{ color: "var(--ink-2)" }}>
              $
            </span>
            <input
              name="price"
              type="number"
              min={0}
              max={1000}
              step="0.5"
              defaultValue={(brain.price_cents / 100).toFixed(2)}
              style={{
                width: 120,
                padding: ".55rem .7rem",
                border: "1.5px solid var(--ink)",
                background: "var(--paper)",
                font: "inherit",
              }}
            />
            {brain.sales_count > 0 && (
              <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)" }}>
                {brain.sales_count} sold
              </span>
            )}
          </div>
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

        {/* The gallery card. A style is judged with the eyes in a second, so a
            brain without one lists below every brain that has one — which is
            the correct incentive, and the reason this sits in the sharing
            settings rather than three clicks away. */}
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: ".6rem" }}>
          <legend className="eyebrow" style={{ padding: 0 }}>Gallery cover</legend>
          <p style={{ color: "var(--ink-2)", fontSize: ".9375rem", margin: 0, maxWidth: "56ch" }}>
            One image, shown on the catalogue and the style gallery. It is the
            only upload that becomes public — everything you taught the brain
            with stays private.
          </p>
          <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
            {existingCover && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={existingCover}
                alt="Current cover"
                width={120}
                height={90}
                style={{ width: 120, height: 90, objectFit: "cover", border: "1.5px solid var(--ink)" }}
              />
            )}
            <span style={{ display: "grid", gap: ".5rem" }}>
              <input type="file" name="cover" accept="image/*" form="cover-form" />
              <span style={{ display: "flex", gap: ".6rem", alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn btn-ghost" form="cover-form" disabled={savingCover} style={{ padding: ".4rem .8rem" }}>
                  {savingCover ? "Uploading…" : existingCover ? "Replace cover" : "Upload cover"}
                </button>
                {cover?.error && (
                  <span className="mono" style={{ fontSize: ".75rem", color: "var(--color-riso-red)" }}>{cover.error}</span>
                )}
                {cover?.ok && (
                  <span className="mono" style={{ fontSize: ".75rem", color: "var(--color-riso-green)" }}>Saved</span>
                )}
              </span>
            </span>
          </div>
        </fieldset>

        <label style={{ display: "flex", gap: ".6rem", alignItems: "flex-start" }}>
          <input
            type="checkbox"
            name="contributions"
            defaultChecked={brain.contributions}
            style={{ marginTop: ".25rem" }}
          />
          <span>
            <strong>Take proposals from readers</strong>
            <span style={{ display: "block", color: "var(--ink-2)", fontSize: ".9375rem" }}>
              Someone whose agent learns something about this brain mid-task can send
              it to you. Proposals always wait for your approval — they are invisible
              to search and absent from the exam until you take them — so this cannot
              change what the brain answers, only what is in your review queue.
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
            {settings.moderation
              ? "Saved — publication sent for review. The brain stays as it is until an operator approves; everything else applied."
              : "Saved"}
          </p>
        )}

        <div>
          <button className="btn" disabled={savingSettings}>
            {savingSettings ? "Saving…" : "Save"}
          </button>
        </div>
      </form>

      <section style={{ marginTop: "2rem" }}>
        <h2 className="h2" style={{ marginBottom: ".75rem" }}>
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
