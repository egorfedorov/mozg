"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createBrain } from "../actions";
import { TOPICS } from "@/lib/topics";

const EXAMPLES = [
  "Match our design system exactly: colour, type scale, spacing, component rules, empty and error states.",
  "Answer questions about the Stripe webhook flow we actually run — our retries and idempotency, not the docs version.",
  "Follow our Postgres conventions: naming, migrations, indexing, and the things we never do.",
];

export default function NewBrainForm({
  parents,
}: {
  parents: { id: string; title: string }[];
}) {
  const [state, action, pending] = useActionState(createBrain, null);

  return (
    <>
      <form action={action} className="panel" style={{ display: "grid", gap: "1.5rem" }}>
        <Field
          label="Name"
          hint="What you'll call it in your editor, e.g. mozg:design"
        >
          <input
            name="title"
            required
            maxLength={80}
            autoFocus
            placeholder="Design system"
            style={inputStyle}
          />
        </Field>

        <Field
          label="Field"
          hint="How people find it in the catalogue if you ever publish it."
        >
          <select name="topic" defaultValue="web" style={inputStyle}>
            {TOPICS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        {parents.length > 0 && (
          <Field
            label="Group it under"
            hint="For a big subject split into parts. Searching the parent searches every child."
          >
            <select name="parent" defaultValue="" style={inputStyle}>
              <option value="">on its own</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field
          label="What should it be able to do?"
          hint="This becomes the exam. Be concrete — vague goals produce vague checks."
        >
          <textarea name="goal" rows={4} placeholder={EXAMPLES[0]} style={inputStyle} />
        </Field>

        <Field
          label="Price (optional)"
          hint="In USD. A price makes the brain public in the catalogue right away — buyers pay once and keep access as it updates. Leave 0 to keep it private."
        >
          <input
            name="price"
            type="text"
            inputMode="decimal"
            placeholder="0"
            style={{ ...inputStyle, maxWidth: 140 }}
          />
        </Field>

        <Field
          label="Documentation link (optional)"
          hint="One link is enough — every page of that documentation is found and read. For docs sites that are JavaScript apps, paste the GitHub repository instead."
        >
          <input
            name="docs"
            type="url"
            placeholder="https://example.com/docs — or github.com/owner/repo"
            style={inputStyle}
          />
        </Field>

        <div>
          <p className="eyebrow" style={{ marginBottom: ".5rem" }}>
            Examples
          </p>
          <ul
            style={{
              margin: 0,
              paddingLeft: "1.1rem",
              color: "var(--ink-2)",
              fontSize: ".9375rem",
              display: "grid",
              gap: ".35rem",
            }}
          >
            {EXAMPLES.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>

        {state?.error && (
          <p
            className="mono"
            style={{ color: "var(--color-riso-red)", fontSize: ".8125rem", margin: 0 }}
          >
            {state.error}
          </p>
        )}

        <div style={{ display: "flex", gap: ".75rem" }}>
          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create brain"}
          </button>
          <Link className="btn btn-ghost" href="/brains">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: ".7rem .85rem",
  border: "1.5px solid var(--ink)",
  background: "var(--paper)",
  color: "var(--ink)",
  font: "inherit",
  fontSize: "1rem",
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: ".4rem" }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)" }}>
        {hint}
      </span>
      {children}
    </label>
  );
}
