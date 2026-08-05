"use server";

import { redirect } from "next/navigation";
import { query, one } from "@/db";
import { currentUser } from "@/lib/session";
import { limitsFor } from "@/lib/plans";
import { enqueueExam } from "@/worker/queue";

/**
 * The style-brain builder: an artist fills named fields — palette, light,
 * line, nevers — and each filled field becomes a properly-shaped note in a
 * fresh brain. Same tables, same exam, same marketplace as every brain; the
 * form exists because "describe your style as twenty atomic notes" is
 * obvious to us and alien to an illustrator meeting the product cold.
 */
export async function createStyleBrain(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/styles/new");

  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (name.length < 3) return { error: "Name the style — three characters at least." };

  const { n } = await one<{ n: number }>(
    `select count(*)::int as n from brains where owner_id = $1`,
    [user.id],
  );
  if (n >= limitsFor(user.plan).brains) {
    return { error: "Brain limit reached on your plan — upgrade in settings, or free a slot." };
  }

  const fields: { key: string; category: string; kind: string; title: string }[] = [
    { key: "palette", category: "Palette", kind: "rule", title: "Palette — the exact colours" },
    { key: "light", category: "Light & shading", kind: "rule", title: "How light and shading behave" },
    { key: "line", category: "Line & outline", kind: "rule", title: "Line and outline character" },
    { key: "texture", category: "Texture & materials", kind: "rule", title: "Texture and material treatment" },
    { key: "composition", category: "Composition", kind: "rule", title: "Composition habits" },
    { key: "subjects", category: "Subjects", kind: "fact", title: "Typical subjects and how they are treated" },
    { key: "nevers", category: "Nevers", kind: "pitfall", title: "The hard nevers — instantly off-style" },
    { key: "references", category: "Background", kind: "fact", title: "Where the style comes from" },
  ];

  // Sections are optional: the works-first path creates the brain nearly
  // empty and lets ingest write the rules FROM the uploaded artworks — the
  // extractor reads images, and the goal below steers it at style. Anything
  // the artist did write becomes a note the extractor then builds around.
  const notes = fields
    .map((f) => ({ ...f, body: String(formData.get(f.key) ?? "").trim().slice(0, 2000) }))
    .filter((f) => f.body.length >= 20);

  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) + "-style";

  const exists = await query(`select 1 from brains where owner_id = $1 and slug = $2`, [
    user.id,
    slug,
  ]);
  if (exists.length) return { error: `You already have a brain at "${slug}".` };

  const brain = await one<{ id: string }>(
    `insert into brains (owner_id, slug, title, goal, topic, color, review_required)
     values ($1, $2, $3, $4, 'art', 'red', false)
     returning id`,
    [
      user.id,
      slug,
      name,
      `Reproduce the "${name}" style exactly in generated or hand-made art: its palette, light, line and composition rules, and the hard nevers — so an agent prompting an image model matches the style instead of approximating it.`,
    ],
  );

  for (const note of notes) {
    await query(
      `insert into notes (brain_id, title, body, category, kind, author, status)
       values ($1, $2, $3, $4, $5, 'human', 'active')`,
      [brain.id, note.title, note.body, note.category, note.kind],
    );
  }

  // The exam is the product: the score on the style card is what separates
  // this from a prompt paste-bin. Queued only when there is something to
  // examine — a works-first brain sits it after the artworks are read.
  if (notes.length) await enqueueExam(brain.id).catch(() => {});

  // Straight to the drop zone: the next step is throwing artworks in, and
  // the brain page is where that lives.
  redirect(`/brains/${slug}?welcome=style`);
}
