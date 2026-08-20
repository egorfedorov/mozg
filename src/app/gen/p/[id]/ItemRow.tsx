"use client";

import { useState } from "react";
import { useT } from "@/lib/t-client";
import { formatCents } from "@/lib/money-math";
import { saveItemSpec, dropItem } from "@/app/gen/project-actions";

/**
 * One asset in the set.
 *
 * Closed it is a line you can scan thirteen of; open it is the one field that
 * matters. That shape is deliberate — the common case is reading the set and
 * changing two of them, and a page of thirteen open textareas makes the common
 * case the hardest one.
 *
 * The rank in the label is a caption, not a rename. Internally these are a
 * value ladder — low-1 is cheap because a cheap symbol must look cheap — and
 * the ladder is what stops a model handing back a jewelled amulet for the
 * bottom of the paytable. Studios say "the J" though, so both are shown and
 * the ladder stays the thing that is stored.
 */
const RANK: Record<string, string> = {
  "low-1": "9",
  "low-2": "10",
  "low-3": "J",
  "low-4": "Q",
  "mid-1": "K",
  "mid-2": "A",
};

const STATUS: Record<string, { label: string; tint: string }> = {
  planned: { label: "planned", tint: "var(--ink-3)" },
  generating: { label: "drawing…", tint: "var(--color-riso-orange)" },
  done: { label: "done", tint: "var(--color-riso-green)" },
  failed: { label: "failed", tint: "var(--color-riso-red)" },
};

export default function ItemRow({
  projectId,
  item,
  priceCents,
}: {
  projectId: string;
  item: { label: string; role: string; spec: string | null; status: string };
  priceCents: number;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  const rank = RANK[item.label];
  const status = STATUS[item.status] ?? STATUS.planned;
  const editable = item.status === "planned";

  return (
    <div className="panel" style={{ padding: ".85rem 1rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: ".75rem", flexWrap: "wrap" }}>
        <strong className="mono">{item.label}</strong>
        {rank && (
          <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>
            {t("reads as")} {rank}
          </span>
        )}
        <span className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)" }}>
          {item.role}
        </span>
        <span className="mono" style={{ fontSize: ".6875rem", color: status.tint }}>
          {t(status.label)}
        </span>
        <span style={{ marginLeft: "auto", display: "flex", gap: ".5rem", alignItems: "center" }}>
          <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>
            {formatCents(priceCents)}
          </span>
          {editable && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: ".25rem .6rem", fontSize: ".75rem" }}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? t("close") : item.spec ? t("edit") : t("describe")}
            </button>
          )}
        </span>
      </div>

      {!open && (
        <p
          style={{
            color: item.spec ? "var(--ink-2)" : "var(--ink-3)",
            margin: ".4rem 0 0",
            fontSize: ".875rem",
            fontStyle: item.spec ? "normal" : "italic",
          }}
        >
          {item.spec ?? t("drawn from the world described above")}
        </p>
      )}

      {open && (
        <form action={saveItemSpec} style={{ marginTop: ".6rem", display: "grid", gap: ".5rem" }}>
          <input type="hidden" name="project" value={projectId} />
          <input type="hidden" name="label" value={item.label} />
          <textarea
            name="spec"
            defaultValue={item.spec ?? ""}
            rows={3}
            maxLength={2000}
            placeholder={t("Leave empty and this asset is drawn from the game's world alone — which is usually the right answer.")}
            style={{
              width: "100%",
              fontSize: ".875rem",
              padding: ".55rem .65rem",
              border: "1.5px solid var(--rule)",
              background: "var(--paper)",
              color: "var(--ink)",
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: ".5rem" }}>
            <button className="btn" style={{ padding: ".3rem .8rem", fontSize: ".8125rem" }}>
              {t("Save")}
            </button>
            <button
              formAction={dropItem}
              className="btn btn-ghost"
              style={{ padding: ".3rem .8rem", fontSize: ".8125rem", color: "var(--color-riso-red)" }}
            >
              {t("Remove from set")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
