import sharp from "sharp";
import { z } from "zod";
import { costCents, structured, type Usage } from "@/lib/claude";
import { env } from "@/lib/env";
import type { NoteKind } from "@/db/types";

/**
 * Screenshot -> notes.
 *
 * Extraction is goal-aware on purpose: the same screenshot yields different
 * knowledge depending on what the brain is for. A generic "describe this image"
 * prompt fills a brain with true-but-useless observations.
 */

const NOTE_KINDS = ["fact", "rule", "layout", "example", "pitfall"] as const;

export interface ExtractedNote {
  title: string;
  body: string;
  kind: NoteKind;
  category: string;
  confidence: number;
}

export interface ExtractResult {
  notes: ExtractedNote[];
  usage: { inputTokens: number; outputTokens: number; costCents: number };
}

const responseSchema = z.object({
  notes: z.array(
    z.object({
      title: z.string().min(1).max(200),
      body: z.string().min(1),
      kind: z.enum(NOTE_KINDS),
      category: z.string().min(1).max(80),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

const JSON_SCHEMA = {
  type: "object",
  properties: {
    notes: {
      type: "array",
      description: "Self-contained facts. Empty if nothing relevant is present.",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short, specific, searchable." },
          body: {
            type: "string",
            description:
              "The fact itself, in full sentences, understandable without the image.",
          },
          kind: { type: "string", enum: [...NOTE_KINDS] },
          category: {
            type: "string",
            description: "Grouping label, reused across notes in the same brain.",
          },
          confidence: { type: "number", description: "0..1, how sure you are." },
        },
        required: ["title", "body", "kind", "category", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["notes"],
  additionalProperties: false,
} as const;

function systemPrompt(goal: string | null, categories: string[]): string {
  return [
    "You build knowledge packs that AI coding agents read later, through a",
    "search tool. You are given one screenshot at a time.",
    "",
    goal
      ? `The brain you are filling exists for this goal:\n<goal>\n${goal}\n</goal>`
      : "The brain has no stated goal yet — extract whatever a developer would need to reproduce or reason about what is shown.",
    "",
    "Extract only facts that someone working toward that goal would need.",
    "",
    "For each fact write a self-contained note:",
    "- title: short and specific, the words someone would actually search for.",
    "- body: the fact in full sentences. It must make sense to a reader who",
    "  cannot see the image. Never write 'as shown above' or 'in this screen'.",
    "- kind: fact | rule | layout | example | pitfall.",
    "- category: a grouping label. Reuse an existing one when it fits.",
    "- confidence: lower it when you are inferring rather than reading.",
    "",
    "Prefer concrete values over description: exact pixel offsets, hex colours,",
    "exact wording, ordering, counts, state names. 'The balance sits 24px from",
    "the left edge' is useful; 'the balance is on the left' is not.",
    "",
    categories.length
      ? `Categories already used in this brain, reuse where they fit:\n${categories.map((c) => `- ${c}`).join("\n")}`
      : "",
    "",
    "Ignore decoration, watermarks, browser chrome, and anything unrelated to",
    "the goal. Never transcribe credentials, tokens, or personal data even if",
    "they are visible.",
    "",
    "If the screenshot contains nothing relevant to the goal, return an empty",
    "list. An empty list is a correct answer and is much better than inventing",
    "notes to seem useful.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Downsample before upload. Full-res on Opus 5 is up to ~4784 image tokens;
 * 1568px long edge lands around ~1600 and reads UI screenshots fine.
 */
export async function prepareImage(
  input: Buffer,
): Promise<{ data: string; mediaType: "image/png" | "image/jpeg"; bytes: number }> {
  const image = sharp(input, { failOn: "none" });
  const meta = await image.metadata();
  const longEdge = Math.max(meta.width ?? 0, meta.height ?? 0);

  let pipeline = image.rotate(); // honour EXIF orientation
  if (longEdge > env.INGEST_IMAGE_MAX_EDGE) {
    pipeline = pipeline.resize({
      width: meta.width! >= meta.height! ? env.INGEST_IMAGE_MAX_EDGE : undefined,
      height: meta.height! > meta.width! ? env.INGEST_IMAGE_MAX_EDGE : undefined,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  // PNG for screenshots: text stays crisp, and UI art compresses well anyway.
  const out = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  return { data: out.toString("base64"), mediaType: "image/png", bytes: out.length };
}

const TOOL_DESCRIPTION =
  "Save the notes extracted from this source. Call once, with every note you " +
  "found. Pass an empty list if the source holds nothing relevant to the goal.";

export async function extractFromImage(
  image: Buffer,
  opts: { goal: string | null; categories?: string[] },
): Promise<ExtractResult> {
  const { data, mediaType } = await prepareImage(image);

  const { data: raw, usage } = await structured<unknown>({
    model: env.MODEL_EXTRACT,
    system: systemPrompt(opts.goal, opts.categories ?? []),
    toolName: "save_notes",
    toolDescription: TOOL_DESCRIPTION,
    schema: JSON_SCHEMA,
    content: [
      { type: "image", source: { type: "base64", media_type: mediaType, data } },
      { type: "text", text: "Extract the notes." },
    ],
  });

  return finish(raw, usage);
}

/** The schema is enforced server-side, but a proxy might not — verify locally. */
function finish(raw: unknown, usage: Usage): ExtractResult {
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`extraction schema mismatch: ${parsed.error.issues[0]?.message}`);
  }
  return {
    notes: parsed.data.notes,
    usage: {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      costCents: costCents(env.MODEL_EXTRACT, usage),
    },
  };
}

/** Plain text and URLs skip vision but reuse the same goal-aware prompt. */
/**
 * PDFs go to the model as a document block, not as text we scraped out first.
 * Design systems and API docs arrive as PDFs constantly, and the layout — which
 * column a value sits in, what a diagram is pointing at — is exactly the part a
 * text extractor throws away.
 */
export async function extractFromPdf(
  pdf: Buffer,
  opts: { goal: string | null; categories?: string[]; label?: string },
): Promise<ExtractResult> {
  const { data: raw, usage } = await structured<unknown>({
    model: env.MODEL_EXTRACT,
    system: systemPrompt(opts.goal, opts.categories ?? []),
    toolName: "save_notes",
    toolDescription: TOOL_DESCRIPTION,
    schema: JSON_SCHEMA,
    content: [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: pdf.toString("base64"),
        },
      },
      {
        type: "text",
        text: `${opts.label ? `Source: ${opts.label}\n\n` : ""}Extract the notes.`,
      },
    ],
  });

  return finish(raw, usage);
}

export async function extractFromText(
  text: string,
  opts: { goal: string | null; categories?: string[]; label?: string },
): Promise<ExtractResult> {
  const { data: raw, usage } = await structured<unknown>({
    model: env.MODEL_EXTRACT,
    system: systemPrompt(opts.goal, opts.categories ?? []),
    toolName: "save_notes",
    toolDescription: TOOL_DESCRIPTION,
    schema: JSON_SCHEMA,
    content: [
      {
        type: "text",
        text: `${opts.label ? `Source: ${opts.label}\n\n` : ""}${text.slice(0, 400_000)}`,
      },
    ],
  });

  return finish(raw, usage);
}
