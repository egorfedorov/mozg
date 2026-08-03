/**
 * Run extraction on one or more files and print what came back. No database,
 * no embeddings, no queue — just "does the model read this screenshot the way
 * we need, and what does it cost".
 *
 *   npm run try:extract -- --goal "Match our design system exactly" shots/*.png
 */
import { basename, extname } from "node:path";
import { readFile } from "node:fs/promises";
import { extractFromImage, extractFromText } from "@/lib/extract";
import { env } from "@/lib/env";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const goal = arg("goal") ?? null;
  const files = process.argv
    .slice(2)
    .filter((a) => !a.startsWith("--") && a !== goal);

  if (!files.length) throw new Error("give me at least one file");

  console.log(`model:  ${env.MODEL_EXTRACT}`);
  console.log(`via:    ${env.ANTHROPIC_BASE_URL ?? "api.anthropic.com"}`);
  console.log(`goal:   ${goal ?? "(none)"}\n`);

  const categories = new Set<string>();
  let cost = 0;

  for (const path of files) {
    const started = Date.now();
    process.stdout.write(`${basename(path)} … `);

    const body = await readFile(path);
    const isImage = IMAGE_EXT.has(extname(path).toLowerCase());

    const result = isImage
      ? await extractFromImage(body, { goal, categories: [...categories] })
      : await extractFromText(body.toString("utf8"), {
          goal,
          categories: [...categories],
          label: basename(path),
        });

    cost += result.usage.costCents;
    console.log(
      `${result.notes.length} notes · ${result.usage.costCents.toFixed(2)}¢ · ` +
        `${((Date.now() - started) / 1000).toFixed(1)}s`,
    );

    for (const note of result.notes) {
      categories.add(note.category);
      console.log(`\n  [${note.kind}] ${note.title}`);
      console.log(`  ${note.category} · confidence ${note.confidence}`);
      console.log(
        `  ${note.body.replace(/\n/g, "\n  ").slice(0, 400)}${note.body.length > 400 ? "…" : ""}`,
      );
    }
    console.log();
  }

  console.log(`total ${cost.toFixed(1)}¢ across ${files.length} file(s)`);
  console.log(`categories: ${[...categories].join(", ") || "(none)"}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n" + (err instanceof Error ? err.message : String(err)));
    process.exit(1);
  });
