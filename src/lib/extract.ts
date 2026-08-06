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

/** Bumped when the extraction prompt changes meaningfully — it invalidates
 *  the extraction cache, which cannot see the prompt any other way. */
export const EXTRACT_PROMPT_VERSION = "v3";

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

// Lenient where a model's slip is repairable: a made-up kind, an over-long
// title or a confidence of 1.2 must cost that field its polish, not the whole
// page its extraction — smaller models invent enum values now and then, and
// one bad label was failing a segment that held ten good notes.
export const responseSchema = z.object({
  notes: z.array(
    z.object({
      title: z.string().min(1).transform((s) => s.slice(0, 200)),
      body: z.string().min(1),
      kind: z.enum(NOTE_KINDS).catch("fact"),
      category: z.string().min(1).transform((s) => s.slice(0, 80)),
      confidence: z.number().catch(0.7).transform((n) => Math.min(1, Math.max(0, n))),
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

/**
 * Which of the two extractors this source gets. A style brain reads its
 * material as an art director; everything else reads it as a knowledge pack.
 */
function promptFor(opts: {
  goal: string | null;
  categories?: string[];
  focus?: string[];
  style?: boolean;
}): string {
  return opts.style
    ? styleSystemPrompt(opts.goal, opts.categories ?? [], opts.focus ?? [])
    : systemPrompt(opts.goal, opts.categories ?? [], opts.focus ?? []);
}

/**
 * The style extractor.
 *
 * A separate prompt, not a paragraph bolted onto the knowledge one, because
 * almost every instruction in that prompt is actively wrong here. It says the
 * reader is a coding agent, asks for pixel offsets and API tables, and calls
 * code examples first-class. Pointed at a painting, a model following it finds
 * none of those, and falls back to the one thing an image always affords:
 * describing the mood. "Warm, nostalgic, hand-drawn feel" is true of ten
 * thousand illustrators and reproduces none of them.
 *
 * So this asks the opposite question. Not "what is depicted" but "what would I
 * have to do to draw the next one" — and it insists on numbers, because a
 * measurement is the only kind of style note that survives being read by a
 * machine six months later. The named categories are fixed on purpose: they
 * match the fields /styles/new offers, so a style written by hand and a style
 * read from artwork land in the same shelves and the exam can compare them.
 */
function styleSystemPrompt(
  goal: string | null,
  categories: string[],
  focus: string[] = [],
): string {
  return [
    "You are an art director reverse-engineering a visual style so that another",
    "artist — or an image model — can reproduce it exactly. You are given one",
    "artwork at a time.",
    "",
    goal
      ? `The style you are describing:\n<goal>\n${goal}\n</goal>`
      : "Describe the style of the artwork so it can be reproduced.",
    "",
    "You are NOT describing what is depicted. Nobody will ask this brain what",
    "was in the picture. They will ask how to make the next one look like it.",
    "A note about the subject is waste; a note about the treatment is the",
    "product.",
    "",
    "MEASURE, do not admire. Every note must carry something a person could",
    "check by holding a ruler, a colour picker or a stopwatch to the work:",
    "- exact hex values, and which one dominates and which one accents;",
    "- outline weight, whether it varies along a stroke, whether it is closed;",
    "- how shading is achieved — halftone, hatching, flat blocks, gradient —",
    "  and at what density or angle;",
    "- edge treatment: hard, feathered, keyline, none;",
    "- how light behaves: direction, whether shadows are coloured, contrast;",
    "- composition habits: negative space, where the subject sits, framing;",
    "- proportion rules, especially for faces and figures;",
    "- texture and grain, and whether it sits over everything or only in shapes.",
    "",
    "'The palette is warm and muted' is worthless. '#f15060 coral is the only",
    "saturated colour; everything else is #eceee7 cream and near-black #14161a'",
    "is the note. If you cannot put a value on something, say what it is",
    "measured against instead — 'the outline is roughly twice the weight of the",
    "interior linework'.",
    "",
    "Write at least one 'pitfall' note for what this style NEVER does. The",
    "nevers are what stop an imitation: anyone can copy a palette, and the",
    "thing that gives a fake away is the gradient or the glow the original",
    "would never use. Look for what is conspicuously absent.",
    "",
    "For each observation write a self-contained note:",
    "- title: short, searchable, naming the aspect ('Outline weight and colour').",
    "- body: the rule in full sentences, with its values. It must make sense to",
    "  a reader who cannot see the artwork. Never write 'as shown here'.",
    "- kind: rule for how to do it, fact for what it is, pitfall for a never.",
    "- category: one of Palette, Line & outline, Light & shading, Texture &",
    "  materials, Composition, Subjects, Nevers, Background. Reuse these exact",
    "  names — the style's own form uses them.",
    "- confidence: lower it when one artwork is thin evidence for a rule. A",
    "  habit you can only see once is a guess; say so with the number.",
    "",
    ...(focus.length
      ? [
          "IN ADDITION to the full extraction above — never instead of it — the",
          "brain currently FAILS these exam questions. If this artwork shows",
          "their answer, measure it precisely:",
          ...focus.map((q) => `- ${q}`),
          "",
        ]
      : []),
    categories.length
      ? `Categories already used in this brain, reuse where they fit:\n${categories.map((c) => `- ${c}`).join("\n")}`
      : "",
    "",
    "Never transcribe a signature, a watermark, or any personal data.",
    "",
    "If the artwork shows nothing about the style that you can state as a rule,",
    "return an empty list. That is a correct answer and far better than",
    "inventing an observation to seem useful.",
  ]
    .filter(Boolean)
    .join("\n");
}

function systemPrompt(
  goal: string | null,
  categories: string[],
  focus: string[] = [],
): string {
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
    "- category: a grouping label. Reuse an existing one when it fits. Use",
    "  \"parent/child\" (e.g. \"typography/scale\") when a subject has natural",
    "  sub-areas — one level only.",
    "- confidence: lower it when you are inferring rather than reading.",
    "",
    "Prefer concrete values over description: exact pixel offsets, hex colours,",
    "exact wording, ordering, counts, state names. 'The balance sits 24px from",
    "the left edge' is useful; 'the balance is on the left' is not.",
    "",
    "When the source specifies an interface — an API endpoint, a parameter or",
    "field table, a config reference, an error list — keep it lossless: every",
    "field with its exact name, type, whether it is required, and its default,",
    "row by row in the body. Never summarise a table into prose; 'takes several",
    "options' loses exactly the row a reader will come looking for. A long note",
    "that preserves the table beats three short notes that describe it.",
    "",
    "Working code examples are first-class material: keep them whole in an",
    "'example' note, verbatim, with one line saying what the example shows.",
    "Agents ask for 'show me an example' constantly, and a paraphrased snippet",
    "does not run.",
    "",
    // The exam steering the extraction: these are the questions the brain
    // currently fails. Every (re)read is a chance to close them.
    ...(focus.length
      ? [
          "IN ADDITION to the full extraction above — never instead of it —",
          "the brain currently FAILS these exam questions. If this source",
          "contains their answers, capture them precisely, exact values and",
          "exact names, even if you would otherwise judge the detail minor.",
          "Do not narrow the rest of your extraction because of this list;",
          "everything the goal needs still gets extracted as usual:",
          ...focus.map((q) => `- ${q}`),
          "",
        ]
      : []),
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
  opts: { goal: string | null; categories?: string[]; focus?: string[]; style?: boolean },
): Promise<ExtractResult> {
  const { data, mediaType } = await prepareImage(image);

  const { data: raw, usage } = await structured<unknown>({
    model: env.MODEL_EXTRACT,
    system: promptFor(opts),
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
    // Name the fields that broke, like the exam's judge does — "schema
    // mismatch" alone sends the next person to re-read the schema, which is
    // almost never where the problem is.
    throw new Error(
      `extraction schema mismatch: ${parsed.error.issues
        .slice(0, 2)
        .map((i) => `${i.path.join(".") || "root"} ${i.message}`)
        .join("; ")}`,
    );
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
  opts: { goal: string | null; categories?: string[]; label?: string; focus?: string[]; style?: boolean },
): Promise<ExtractResult> {
  const { data: raw, usage } = await structured<unknown>({
    model: env.MODEL_EXTRACT,
    system: promptFor(opts),
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

/**
 * How much text goes to the model in one pass.
 *
 * This used to be a single call with `text.slice(0, 400_000)`, which quietly
 * threw away everything past the cut and reported success — a 726 KB schema
 * page ingested as its first 55% with nothing anywhere saying so. It also gave
 * the model an input large enough that it sometimes answered without the notes
 * array at all, failing the whole source.
 *
 * MAX_SEGMENTS is a hard cap, and going past it now fails loudly rather than
 * repeating the original sin in segmented form: a source whose tail is dropped
 * must say so, or the brain claims knowledge it never read.
 */
const SEGMENT = 60_000;
const MAX_SEGMENTS = 12;

/** Split on blank lines so a segment does not start mid-sentence. */
export function segments(text: string): string[] {
  if (text.length <= SEGMENT) return [text];

  const out: string[] = [];
  let rest = text;
  while (rest.length) {
    if (out.length >= MAX_SEGMENTS) {
      throw new Error(
        `source text is ${Math.round(text.length / 1000)} KB — over the ` +
          `${Math.round((SEGMENT * MAX_SEGMENTS) / 1000)} KB one source can hold. ` +
          "Split it into smaller sources; nothing was ingested.",
      );
    }
    if (rest.length <= SEGMENT) {
      out.push(rest);
      break;
    }
    const window = rest.slice(0, SEGMENT);
    const cut = window.lastIndexOf("\n\n");
    const at = cut > SEGMENT / 2 ? cut : SEGMENT;
    out.push(rest.slice(0, at));
    rest = rest.slice(at);
  }
  return out;
}

/** Segments extracted at once. Above this, a burst of a 12-segment page
 *  starts tripping reseller rate limits and the retries eat the win. */
const SEGMENT_CONCURRENCY = 4;

export async function extractFromText(
  text: string,
  opts: { goal: string | null; categories?: string[]; label?: string; focus?: string[]; style?: boolean },
): Promise<ExtractResult> {
  const parts = segments(text);

  const notes: ExtractedNote[] = [];
  let usage = { inputTokens: 0, outputTokens: 0, costCents: 0 };
  let failed = 0;

  const extractPart = async (part: string, i: number): Promise<ExtractResult | null> => {
    const where = parts.length > 1 ? ` (part ${i + 1} of ${parts.length})` : "";
    try {
      const { data: raw, usage: u } = await structured<unknown>({
        model: env.MODEL_EXTRACT,
        system: promptFor(opts),
        toolName: "save_notes",
        toolDescription: TOOL_DESCRIPTION,
        schema: JSON_SCHEMA,
        content: [
          {
            type: "text",
            text: `${opts.label ? `Source: ${opts.label}${where}\n\n` : ""}${part}`,
          },
        ],
      });
      return finish(raw, u);
    } catch (err) {
      // One bad segment should not lose the other eleven. A page that fails
      // entirely still throws, so the source is marked failed rather than
      // stored as a partial nobody knows is partial.
      console.warn(
        `[extract] ${opts.label ?? "text"}${where} failed: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      return null;
    }
  };

  // Batches of a few at a time: a 12-segment page used to take 12 sequential
  // model calls — the single slowest thing a big page did. Results are
  // collected in segment order so note order stays stable.
  for (let start = 0; start < parts.length; start += SEGMENT_CONCURRENCY) {
    const batch = parts.slice(start, start + SEGMENT_CONCURRENCY);
    const results = await Promise.all(batch.map((p, j) => extractPart(p, start + j)));
    for (const result of results) {
      if (!result) {
        failed++;
        continue;
      }
      notes.push(...result.notes);
      usage = {
        inputTokens: usage.inputTokens + result.usage.inputTokens,
        outputTokens: usage.outputTokens + result.usage.outputTokens,
        costCents: usage.costCents + result.usage.costCents,
      };
    }
  }

  // Zero notes with zero failures is the model doing what the prompt says:
  // "an empty list is a correct answer" — index pages and stub pages hold
  // nothing worth keeping, and failing them taught the queue to retry pages
  // that were never going to yield anything. Only an all-segments failure is
  // an actual failure.
  if (!notes.length && failed) {
    throw new Error(`every segment failed (${failed} of ${parts.length})`);
  }

  if (failed) {
    console.warn(
      `[extract] ${opts.label ?? "text"}: kept ${notes.length} notes, ` +
        `${failed} of ${parts.length} segments failed`,
    );
  }

  return { notes, usage };
}
