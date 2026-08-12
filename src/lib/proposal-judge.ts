import { z } from "zod";
import { costCents, structured } from "@/lib/claude";
import { env } from "@/lib/env";

/**
 * Can a stranger use this note?
 *
 * A brain's owner has to read every proposal a reader leaves, and sixteen of
 * them sat unread for six days — which is how the contribution loop stops
 * being a loop. So the obvious move is to let a model take the good ones
 * automatically. The trap is which question it asks.
 *
 * "Is this well written?" is the wrong one. The six proposals waiting on this
 * catalogue are all excellent — precise, sourced, with file paths and measured
 * numbers — and every one of them is about a repository nobody else has:
 * "Red Mesa Ink win-by-step celebration is Spine 4.2 at
 * static/assets/red-mesa/spine/fx/win-panel/". Merged into a brain other
 * studios pay for, that answers "how do I do a big win" with confident
 * instructions about a codebase the buyer has never seen. A quality gate would
 * have taken all six.
 *
 * The question that separates them is whether somebody WITHOUT the author's
 * repository could act on it. "Round the paytable amount before applying the
 * multiplier, or a 0.15 pay times two rounds to 0.30 instead of the displayed
 * 0.40" travels. "In games/lucky-keyboard/math/game_calculations.py, L2 5–6 is
 * now 0.2×" does not — not because it is worse, but because it is theirs.
 *
 * A rejected proposal is not thrown away: `belongs` says where it does belong,
 * so the answer to a private note is "put this in your own brain", which is
 * the thing its author actually wanted.
 */

const verdict = z.object({
  general: z.boolean(),
  belongs: z.enum(["catalogue", "own-project"]),
  reason: z.string().max(300),
});

const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    general: {
      type: "boolean",
      description:
        "True only if a reader who does NOT have the author's repository, " +
        "game or account could act on this. When unsure, false.",
    },
    belongs: {
      type: "string",
      enum: ["catalogue", "own-project"],
      description:
        "Where the note belongs: a shared brain other people buy, or the " +
        "author's own private project brain.",
    },
    reason: {
      type: "string",
      description: "One plain sentence the author would accept, naming what decided it.",
    },
  },
  required: ["general", "belongs", "reason"],
  additionalProperties: false,
} as const;

const SYSTEM =
  "A reader has proposed a note for a knowledge brain that other people buy " +
  "and read. Decide whether it belongs there.\n\n" +
  "The only question is whether somebody who does NOT have the author's " +
  "repository, project, game or account could act on this note.\n\n" +
  "Answer general=false — and this is the common answer — when the note:\n" +
  "- names files, directories, modules or asset paths from one codebase;\n" +
  "- describes what one named product, game or app currently does;\n" +
  "- names a clip, asset key, component or setting chosen for one project;\n" +
  "- would be wrong or meaningless to a reader with a different codebase;\n" +
  "- reads as a work log of what was just built or fixed.\n\n" +
  "Answer general=true when the note states something that holds beyond the " +
  "author's own work: a rule, a constraint of a platform or library, a " +
  "measured benchmark, a failure mode and its cause, a convention the tool " +
  "itself imposes.\n\n" +
  "Apply one test to decide: would this still be true and useful for a " +
  "different project of the same kind? Numbers do NOT make a note specific — " +
  "a rule illustrated with concrete values ('rounding a 0.15 pay after a x2 " +
  "multiplier gives 0.30 where the paytable showed 0.40') is exactly what a " +
  "good general note looks like, and stripping the numbers would ruin it. " +
  "What makes a note specific is that the reader needs THAT project to act " +
  "on it — its files, its assets, its current state. A note may name a " +
  "project as an example and stay general if the lesson survives the example " +
  "being removed.\n\n" +
  "Being detailed, precise and well written is not evidence either way. The " +
  "best-written notes are often the most project-specific.";

export interface ProposalVerdict {
  general: boolean;
  belongs: "catalogue" | "own-project";
  reason: string;
  costCents: number;
}

export async function judgeProposal(note: {
  title: string;
  body: string;
}): Promise<ProposalVerdict> {
  const { data: raw, usage } = await structured<unknown>({
    model: env.MODEL_JUDGE,
    maxTokens: 600,
    toolName: "save_verdict",
    toolDescription: "Record where this proposed note belongs.",
    schema: VERDICT_SCHEMA,
    system: SYSTEM,
    content: [
      {
        type: "text",
        text: `<note>\n<title>${note.title}</title>\n<body>${note.body.slice(0, 2000)}</body>\n</note>`,
      },
    ],
  });

  const parsed = verdict.safeParse(raw);
  if (!parsed.success) throw new Error("proposal verdict schema mismatch");
  return { ...parsed.data, costCents: costCents(env.MODEL_JUDGE, usage) };
}

/**
 * Both halves have to agree before anything is taken automatically.
 *
 * `general` is the judgement; `belongs` is the same judgement said a second
 * way, and a model that contradicts itself between the two has not decided
 * anything. Cheap insurance on a path that writes into what people bought.
 */
export function autoApprovable(v: Pick<ProposalVerdict, "general" | "belongs">): boolean {
  return v.general && v.belongs === "catalogue";
}
