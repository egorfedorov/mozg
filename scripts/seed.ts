/**
 * Seed a demo brain with hand-written notes and issue an MCP token.
 *
 * This exists so search and the MCP endpoint can be exercised end-to-end
 * without the Claude API (extraction) or a finished model download. If the
 * embedding service is up the notes get vectors; if not they are text-only and
 * search runs in its degraded, full-text mode — which is worth testing anyway,
 * since that is what users get when the embedder is down.
 *
 *   npm run seed
 */
import { one, maybeOne, query, toVector } from "@/db";
import type { Brain } from "@/db/types";
import { chunksForNote, estimateTokens } from "@/lib/chunk";
import { embedPassages, embedHealthy } from "@/lib/embed";
import { issueToken } from "@/lib/tokens";
import { env } from "@/lib/env";

const GOAL =
  "Match our design system exactly: colour, type scale, spacing, component " +
  "rules, and the empty and error states we actually ship.";

const NOTES: {
  title: string;
  body: string;
  category: string;
  kind: "fact" | "rule" | "layout" | "example" | "pitfall";
}[] = [
  {
    title: "Card border and elevation",
    category: "Colour, borders and elevation",
    kind: "rule",
    body:
      "Cards use a 1px solid #E4E4E7 border and no shadow at rest. Radius is 8px. " +
      "Shadow appears only on drag, never on hover. Interactive cards darken the " +
      "border to #A1A1AA on hover instead of lifting.",
  },
  {
    title: "Section spacing is 32px, inner spacing is 24px",
    category: "Type scale and spacing",
    kind: "rule",
    body:
      "Vertical gap between sections is 32px. 24px is the inner scale — padding " +
      "inside a card, gap between a label and its field. Using 24px between " +
      "sections is the most common mistake in review; it makes the page read as " +
      "one undifferentiated block.",
  },
  {
    title: "Price and numeric type",
    category: "Type scale and spacing",
    kind: "fact",
    body:
      "Prices are set at 40px with 44px line height and font-variant-numeric: " +
      "tabular-nums, so columns of figures align. Currency symbol is the same " +
      "size as the digits, never superscript.",
  },
  {
    title: "Primary button fills width only on mobile",
    category: "Colour, borders and elevation",
    kind: "rule",
    body:
      "The primary call to action is inline on viewports 640px and wider, and " +
      "full width below that. It is filled black (#111113) with white text. " +
      "There is exactly one primary button per view.",
  },
  {
    title: "Empty states name the next action",
    category: "Empty and error states",
    kind: "rule",
    body:
      "An empty state has a one-line explanation and a button that performs the " +
      "action it describes. Never an illustration alone, never the word 'Oops'. " +
      "The heading states what is missing, not that something is missing.",
  },
  {
    title: "Error text sits under the field it belongs to",
    category: "Empty and error states",
    kind: "layout",
    body:
      "Field errors render directly below the input at 13px in #DC2626, and the " +
      "input border switches to the same colour. Errors never appear as a toast; " +
      "toasts are for events the user did not cause.",
  },
  {
    title: "Focus rings are never removed",
    category: "Colour, borders and elevation",
    kind: "pitfall",
    body:
      "outline: none without a replacement is a review blocker. Focus is a 2px " +
      "solid #111113 outline with 2px offset, applied via :focus-visible so it " +
      "does not fire on mouse clicks.",
  },
  {
    title: "Transitions run 120ms with ease-out",
    category: "Motion and transitions",
    kind: "rule",
    body:
      "Hover and press transitions are 120ms ease-out. Anything above 200ms feels " +
      "sluggish in a dense UI. Layout-affecting properties are never transitioned; " +
      "only colour, opacity and transform.",
  },
];

async function main() {
  const owner = await devUser();

  let brain = await maybeOne<Brain>(
    `select * from brains where owner_id = $1 and slug = 'design'`,
    [owner],
  );

  if (!brain) {
    brain = await one<Brain>(
      `insert into brains (owner_id, slug, title, goal, color, review_required)
       values ($1, 'design', 'Design system', $2, 'violet', true)
       returning *`,
      [owner, GOAL],
    );
    console.log("· created brain 'design'");
  } else {
    await query(`delete from notes where brain_id = $1`, [brain.id]);
    console.log("· reset brain 'design'");
  }

  const healthy = await embedHealthy();
  if (!healthy) {
    console.log(
      `· embedding service down at ${env.EMBED_URL} — seeding without vectors\n` +
        "  (search will run text-only; re-run this once the model is ready)",
    );
  }

  for (const note of NOTES) {
    const { id } = await one<{ id: string }>(
      `insert into notes (brain_id, title, body, category, kind, author, confidence)
       values ($1, $2, $3, $4, $5, 'human', 1.0) returning id`,
      [brain.id, note.title, note.body, note.category, note.kind],
    );

    const texts = chunksForNote(note.title, note.body);
    const vectors = healthy ? await embedPassages(texts) : null;

    for (let i = 0; i < texts.length; i++) {
      await query(
        `insert into chunks (brain_id, note_id, content, token_count, embedding)
         values ($1, $2, $3, $4, $5)`,
        [
          brain.id,
          id,
          texts[i],
          estimateTokens(texts[i]),
          vectors ? toVector(vectors[i]) : null,
        ],
      );
    }
  }

  console.log(`· ${NOTES.length} notes seeded`);

  const issued = await issueToken(owner, "seed script");
  console.log(
    `\nConnect an agent:\n\n  claude mcp add --transport http mozg ` +
      `${env.NEXT_PUBLIC_APP_URL}/mcp --header "Authorization: Bearer ${issued.token}"\n`,
  );
}

async function devUser(): Promise<string> {
  const existing = await maybeOne<{ id: string }>(
    `select id from "user" order by "createdAt" limit 1`,
  );
  if (existing) return existing.id;

  const row = await one<{ id: string }>(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt",
                         plan, handle)
     values ('dev-user', 'Dev', 'dev@localhost', true, now(), now(), 'pro', 'dev')
     returning id`,
  );
  console.log("· created dev user");
  return row.id;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n" + (err instanceof Error ? err.message : String(err)));
    process.exit(1);
  });
