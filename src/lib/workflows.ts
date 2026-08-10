import { z } from "zod";

/**
 * A workflow is the route through the shelf.
 *
 * The brains say what is true; this says in what order to ask them and what
 * "done" looks like at each stop. It is deliberately a recipe and not a graph:
 * the thing executing it is an agent that can notice the math did not balance
 * and go back a step, which is exactly what a drawn arrow cannot do.
 *
 * Everything here is data. Nothing in this file runs a step.
 */

export interface WorkflowStep {
  /** What this step produces, as a person would say it. */
  title: string;
  /**
   * The brain to consult, by handle ("mozg/pixijs-casino") or bare slug.
   * Optional: some steps are work with no question to ask — "run the build",
   * "show the user the result" — and forcing a brain on those would send the
   * agent searching for material that does not exist.
   */
  brain?: string;
  /** What to ask that brain, in the words the brain would recognise. */
  ask?: string;
  /**
   * The standing rules for this step: what to always do, what never to do,
   * which file to write, which convention to hold. Separate from `ask`
   * because they are not a question — they survive when the question is
   * answered, and the agent has to carry them through the whole step.
   */
  rules?: string;
  /** How the agent knows this step is finished. A check, not a feeling. */
  done_when?: string;
}

export interface Workflow {
  id: string;
  owner_id: string;
  slug: string;
  title: string;
  summary: string | null;
  steps: WorkflowStep[];
  visibility: "private" | "public";
  created_at: Date;
  updated_at: Date;
}

/**
 * Tolerant on the way in, strict about what a step must carry: a step with no
 * title is unusable to whoever reads the recipe, and the rest are optional
 * because half the steps in a real build are "now run the checks".
 */
export const stepSchema = z.object({
  title: z.string().trim().min(1).transform((s) => s.slice(0, 120)),
  brain: z.string().trim().max(120).optional(),
  ask: z.string().trim().max(2000).optional(),
  rules: z.string().trim().max(2000).optional(),
  done_when: z.string().trim().max(500).optional(),
});

/** Twelve is long for a recipe an agent must hold in context and still act. */
export const MAX_STEPS = 12;

export const stepsSchema = z.array(stepSchema).max(MAX_STEPS);

/**
 * Form values to steps, salvaging per item.
 *
 * Per item and not per route on purpose: the canvas always has one blank node
 * at the end, and an all-or-nothing parse turned a half-written route into an
 * empty one — losing the four steps somebody had just typed because the fifth
 * was still blank. Empty strings are dropped rather than stored, so the agent
 * reads "no rules for this step" instead of a rule that says nothing.
 *
 * The cap is not applied here: quietly returning the first twelve of thirteen
 * is a route that runs to the wrong finish and looks complete. The caller
 * refuses instead.
 */
export function cleanSteps(input: unknown): WorkflowStep[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((item) => {
    const parsed = stepSchema.safeParse(item);
    if (!parsed.success) return [];
    const s = parsed.data;
    return [
      {
        title: s.title,
        ...(s.brain ? { brain: s.brain } : {}),
        ...(s.ask ? { ask: s.ask } : {}),
        ...(s.rules ? { rules: s.rules } : {}),
        ...(s.done_when ? { done_when: s.done_when } : {}),
      },
    ];
  });
}

/**
 * The recipe as the agent receives it.
 *
 * Written as instructions rather than as a data dump: whatever reads this is a
 * model about to act on it, and a numbered list of "ask this brain that" is
 * followed far more faithfully than a JSON blob it has to interpret first.
 */
export function renderWorkflow(w: Pick<Workflow, "title" | "summary" | "steps">): string {
  const lines = [
    `# ${w.title}`,
    ...(w.summary ? ["", w.summary] : []),
    "",
    `${w.steps.length} step${w.steps.length === 1 ? "" : "s"}. Work them in order. ` +
      "Where a step names a brain, search that brain before writing anything — " +
      "its material is newer than your training data and it is what this " +
      "workflow was built around. Do not skip a step because you already know " +
      "the answer.",
    "",
  ];

  w.steps.forEach((s, i) => {
    lines.push(`## ${i + 1}. ${s.title}`);
    if (s.brain) lines.push(`- brain: ${s.brain} — brain_search it first`);
    if (s.ask) lines.push(`- ask it: ${s.ask}`);
    if (s.rules) lines.push(`- rules that hold for this whole step: ${s.rules}`);
    if (s.done_when) lines.push(`- done when: ${s.done_when}`);
    lines.push("");
  });

  lines.push(
    "Report per step: what the brain said that changed what you did, and " +
      "whether the step's own check passed. If a brain had nothing on its " +
      "step, say so plainly — that gap is worth more to the workflow's owner " +
      "than a guess dressed up as an answer.",
  );

  return lines.join("\n");
}
