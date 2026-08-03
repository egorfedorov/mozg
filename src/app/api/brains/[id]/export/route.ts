import { NextResponse } from "next/server";
import { query } from "@/db";
import type { Note } from "@/db/types";
import { accessFor, canExport } from "@/lib/access";
import { requireUser } from "@/lib/session";

/**
 * Export a brain as files an agent reads without mozg in the loop.
 *
 * This looks like it undercuts the product and does the opposite: what people
 * pay for is a brain that keeps getting updated, not a snapshot. Making the
 * snapshot free removes the reason to hesitate before starting.
 */

const LICENSE_NOTICE: Record<string, string> = {
  nc: "Licensed CC BY-NC-SA 4.0 — share and adapt with credit; commercial resale is not permitted.",
  mit: "Licensed MIT.",
  proprietary: "All rights reserved.",
};

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const user = await requireUser(req).catch(() => null);
  const found = await accessFor(id, user?.id ?? null);
  if (!found?.access) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!canExport(found.brain, found.access)) {
    return NextResponse.json(
      { error: "This brain's licence does not allow export." },
      { status: 403 },
    );
  }

  const { brain } = found;
  const format = new URL(req.url).searchParams.get("format") ?? "claude";

  const notes = await query<Note>(
    `select * from notes where brain_id = $1 and status = 'active'
      order by category nulls last, created_at`,
    [brain.id],
  );

  const byCategory = new Map<string, Note[]>();
  for (const note of notes) {
    const key = note.category ?? "General";
    byCategory.set(key, [...(byCategory.get(key) ?? []), note]);
  }

  const sections = [...byCategory.entries()]
    .map(
      ([category, list]) =>
        `## ${category}\n\n` +
        list.map((n) => `### ${n.title}\n\n${n.body}`).join("\n\n"),
    )
    .join("\n\n");

  const header =
    `# ${brain.title}\n\n` +
    (brain.goal ? `${brain.goal}\n\n` : "") +
    `${notes.length} notes` +
    (brain.score !== null ? ` · exam score ${brain.score}%` : "") +
    `\n\n${LICENSE_NOTICE[brain.license]}\n` +
    `Exported from mozg on ${new Date().toISOString().slice(0, 10)}.\n`;

  const { body, filename } = render(format, brain.slug, header, sections);

  return new NextResponse(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

function render(format: string, slug: string, header: string, sections: string) {
  switch (format) {
    case "skill":
      // Claude Skill front matter — the description decides when Claude loads
      // it, so it has to read like a trigger, not a title.
      return {
        filename: `${slug}-skill.md`,
        body:
          `---\nname: ${slug}\ndescription: >-\n  ${header
            .split("\n")[2]
            ?.trim() || slug}. Use when the task depends on these project-specific conventions.\n---\n\n` +
          `${header}\n${sections}\n`,
      };

    case "agents":
      return {
        filename: "AGENTS.md",
        body: `${header}\n${sections}\n`,
      };

    default:
      return {
        filename: "CLAUDE.md",
        body: `${header}\n${sections}\n`,
      };
  }
}
