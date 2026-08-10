"use client";

import { useT } from "@/lib/t-client";
import { useActionState, useState } from "react";
import { deleteWorkflow, saveWorkflow } from "../actions";
import { MAX_STEPS, type WorkflowStep } from "@/lib/workflows";

/**
 * The canvas and the panel.
 *
 * Shaped after the node editors people already know — nodes on the left, the
 * selected node's settings on the right — because that is what the user asked
 * for and it is genuinely the right shape: a route is easier to judge as a
 * picture, and the prompt for a step is too long to live inside a card.
 *
 * What it is NOT is a graph. Every edge here is "and then", so the model
 * underneath stays an ordered list: no node positions to store, no cycles to
 * detect, no orphan branches, and the agent that runs it reads top to bottom.
 * Branching is the agent's job at runtime — it can see that the math did not
 * balance and go back a step, which no drawn arrow can express. If real
 * branches are ever needed, that is a graph and a graph library; today it
 * would be a dependency and a schema paying for a shape nobody has used yet.
 */

const panelInput: React.CSSProperties = {
  padding: ".5rem .65rem",
  border: "1px solid var(--rule)",
  borderRadius: 6,
  font: "inherit",
  background: "var(--paper)",
  color: "inherit",
  width: "100%",
};

const blank: WorkflowStep = { title: "" };

export default function WorkflowEditor({
  slug,
  title,
  summary,
  visibility,
  steps: initial,
  handles,
}: {
  slug: string;
  title: string;
  summary: string;
  visibility: "private" | "public";
  steps: WorkflowStep[];
  handles: string[];
}) {
  const t = useT();
  const [state, action, pending] = useActionState(saveWorkflow, null);
  const [steps, setSteps] = useState<WorkflowStep[]>(
    initial.length ? initial : [{ title: "" }],
  );
  const [selected, setSelected] = useState(0);

  const step = steps[selected];

  const patch = (change: Partial<WorkflowStep>) =>
    setSteps((all) => all.map((s, i) => (i === selected ? { ...s, ...change } : s)));

  const addStep = () =>
    setSteps((all) => {
      if (all.length >= MAX_STEPS) return all;
      setSelected(all.length);
      return [...all, { ...blank }];
    });

  const removeStep = (i: number) =>
    setSteps((all) => {
      const next = all.filter((_, n) => n !== i);
      setSelected((s) => Math.max(0, Math.min(s, next.length - 1)));
      return next.length ? next : [{ ...blank }];
    });

  const move = (i: number, by: -1 | 1) =>
    setSteps((all) => {
      const to = i + by;
      if (to < 0 || to >= all.length) return all;
      const next = [...all];
      [next[i], next[to]] = [next[to], next[i]];
      setSelected(to);
      return next;
    });

  return (
    <div className="stack">
      <form action={action} className="stack">
        <input type="hidden" name="slug" value={slug} />
        {/* The canvas is the editor, so the steps travel as one field. */}
        <input type="hidden" name="steps" value={JSON.stringify(steps)} />

        <div className="panel" style={{ display: "grid", gap: "1rem" }}>
          <label style={{ display: "grid", gap: ".35rem" }}>
            <span style={{ fontWeight: 600 }}>{t("What it builds")}</span>
            <input name="title" defaultValue={title} maxLength={80} required style={panelInput} />
          </label>
          <label style={{ display: "grid", gap: ".35rem" }}>
            <span style={{ fontWeight: 600 }}>{t("One line more")}</span>
            <input name="summary" defaultValue={summary} maxLength={200} style={panelInput} />
          </label>
        </div>

        <div className="wf-board">
          {/* ── the canvas ────────────────────────────────────────────── */}
          <div className="wf-canvas">
            <div className="wf-node wf-node-end">
              <span className="eyebrow">{t("Start")}</span>
              <strong>{t("What the user asked for")}</strong>
            </div>

            {steps.map((s, i) => (
              <div key={i} className="wf-chain">
                <span className="wf-edge" aria-hidden />
                <button
                  type="button"
                  className="wf-node"
                  data-selected={i === selected || undefined}
                  onClick={() => setSelected(i)}
                >
                  <span className="eyebrow">
                    {t("Step")} {i + 1}
                  </span>
                  <strong>{s.title || t("Untitled step")}</strong>
                  {s.brain && <code className="mono wf-node-brain">{s.brain}</code>}
                  {s.done_when && <span className="wf-node-check">✓ {s.done_when}</span>}
                </button>
                <span className="wf-node-tools">
                  <button type="button" onClick={() => move(i, -1)} aria-label={t("Move up")}>
                    ↑
                  </button>
                  <button type="button" onClick={() => move(i, 1)} aria-label={t("Move down")}>
                    ↓
                  </button>
                  <button type="button" onClick={() => removeStep(i)} aria-label={t("Remove")}>
                    ×
                  </button>
                </span>
              </div>
            ))}

            <span className="wf-edge" aria-hidden />
            {steps.length < MAX_STEPS ? (
              <button type="button" className="wf-node wf-node-add" onClick={addStep}>
                + {t("Add a step")}
              </button>
            ) : (
              <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)" }}>
                {t("Twelve steps is the most one route holds.")}
              </p>
            )}

            <span className="wf-edge" aria-hidden />
            <div className="wf-node wf-node-end">
              <span className="eyebrow">{t("Done")}</span>
              <strong>{t("The thing exists, and its checks passed")}</strong>
            </div>
          </div>

          {/* ── the panel for the selected node ───────────────────────── */}
          <aside className="wf-panel">
            <span className="eyebrow">
              {t("Step")} {selected + 1} {t("of")} {steps.length}
            </span>

            <label style={{ display: "grid", gap: ".3rem" }}>
              <span style={{ fontWeight: 600 }}>{t("What this step produces")}</span>
              <input
                value={step?.title ?? ""}
                onChange={(e) => patch({ title: e.target.value })}
                maxLength={120}
                placeholder={t("The math model, balanced to 96.5% RTP")}
                style={panelInput}
              />
            </label>

            <label style={{ display: "grid", gap: ".3rem" }}>
              <span style={{ fontWeight: 600 }}>{t("Brain to read first")}</span>
              <span className="mono" style={{ fontSize: ".72rem", color: "var(--ink-2)" }}>
                {t("Leave empty for a step that is plain work — a build, a screenshot.")}
              </span>
              <input
                value={step?.brain ?? ""}
                onChange={(e) => patch({ brain: e.target.value })}
                list="brain-handles"
                maxLength={120}
                style={panelInput}
              />
              <datalist id="brain-handles">
                {handles.map((h) => (
                  <option key={h} value={h} />
                ))}
              </datalist>
            </label>

            <label style={{ display: "grid", gap: ".3rem" }}>
              <span style={{ fontWeight: 600 }}>{t("Prompt — what to ask it")}</span>
              <textarea
                value={step?.ask ?? ""}
                onChange={(e) => patch({ ask: e.target.value })}
                maxLength={2000}
                rows={4}
                placeholder={t("In the brain's own words — those are the words it can find.")}
                style={panelInput}
              />
            </label>

            <label style={{ display: "grid", gap: ".3rem" }}>
              <span style={{ fontWeight: 600 }}>{t("Rules for this step")}</span>
              <span className="mono" style={{ fontSize: ".72rem", color: "var(--ink-2)" }}>
                {t("Always / never. These hold for the whole step, not just the question.")}
              </span>
              <textarea
                value={step?.rules ?? ""}
                onChange={(e) => patch({ rules: e.target.value })}
                maxLength={2000}
                rows={4}
                placeholder={t("Never invent a paytable. Write into math/config.json only.")}
                style={panelInput}
              />
            </label>

            <label style={{ display: "grid", gap: ".3rem" }}>
              <span style={{ fontWeight: 600 }}>{t("Done when")}</span>
              <input
                value={step?.done_when ?? ""}
                onChange={(e) => patch({ done_when: e.target.value })}
                maxLength={500}
                placeholder={t("A check, not a feeling — a command that exits zero.")}
                style={panelInput}
              />
            </label>
          </aside>
        </div>

        <div className="panel" style={{ display: "grid", gap: ".75rem" }}>
          <label style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
            <input
              type="checkbox"
              name="visibility"
              value="public"
              defaultChecked={visibility === "public"}
            />
            <span>{t("Published — anyone's agent can run this route")}</span>
          </label>

          {state?.error && (
            <p className="mono" style={{ color: "var(--color-riso-red)", fontSize: ".8125rem", margin: 0 }}>
              {state.error}
            </p>
          )}
          {state?.ok && (
            <p className="mono" style={{ fontSize: ".8125rem", margin: 0 }}>
              {t("Saved")} · {state.steps} {t("steps")}
            </p>
          )}

          <button className="btn" disabled={pending} style={{ justifySelf: "start" }}>
            {pending ? t("Saving…") : t("Save")}
          </button>
        </div>
      </form>

      <p className="mono" style={{ fontSize: ".8125rem" }}>
        {t("Run it from any agent:")} <code>/mozg:build {slug}</code>
      </p>

      <form action={deleteWorkflow}>
        <input type="hidden" name="slug" value={slug} />
        <button className="btn btn-ghost">{t("Delete this workflow")}</button>
      </form>
    </div>
  );
}
