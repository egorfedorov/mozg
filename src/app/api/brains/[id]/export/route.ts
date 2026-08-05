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

/**
 * Which source wins when both exist.
 *
 * This is the failure the export creates: a machine ends up holding a snapshot
 * of a brain *and* a live connection to it, and a Skill loaded from disk answers
 * without ever asking. The snapshot cannot know it went stale — that is the
 * whole reason the brain is scored and dated — so the file has to say so itself,
 * at the top, where an agent reading it will see it before the material.
 */
const PRECEDENCE =
  "> **This is a snapshot.** It was correct on the day it was exported and has " +
  "no way of noticing that it is not any more. If the mozg MCP server is " +
  "connected in this session, search the live brain instead and use this file " +
  "only as a fallback: the brain is re-read when its sources change and re-sat " +
  "against its own exam, and it can tell you what it does *not* know. Where the " +
  "two disagree, the brain is newer.\n\n";

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

  // The trigger sentence a Skill is loaded by. The goal is written for exactly
  // this job; the fallback used to be `header.split("\n")[2]`, which for a brain
  // with no goal is the note count — "512 notes · exam score 88%" as a trigger
  // means the skill loads for nothing and never for the subject.
  const trigger = brain.goal?.trim()
    ? brain.goal.trim().replace(/\s+/g, " ")
    : `Project knowledge about ${brain.title}.`;

  const { body, filename } = render(format, brain.slug, header, sections, trigger);

  return new NextResponse(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

function render(
  format: string,
  slug: string,
  header: string,
  sections: string,
  trigger: string,
) {
  switch (format) {
    case "skill":
      // Claude Skill front matter — the description decides when Claude loads
      // it, so it has to read like a trigger, not a title.
      //
      // Named `mozg-<slug>` for two reasons. A skill directory is a flat
      // namespace, and plenty of machines already carry a skill called
      // `stake-engine-…` or `pixijs`; an export landing on the same name
      // silently shadows one of them. And the prefix says where the file came
      // from, which matters most in the case below.
      return {
        filename: `mozg-${slug}-skill.md`,
        body:
          `---\nname: mozg-${slug}\ndescription: >-\n  ${trigger} ` +
          `Use when the task depends on these project-specific conventions. ` +
          `Superseded by the live brain: if the mozg MCP server is connected, ` +
          `prefer brain_search on ${slug}.\n---\n\n` +
          PRECEDENCE +
          `${header}\n${sections}\n`,
      };

    // Same warning on the context-file formats: a CLAUDE.md pasted into a repo
    // outlives the day it was true by months, and nothing in it would say so.
    case "agents":
      return {
        filename: "AGENTS.md",
        body: PRECEDENCE + `${header}\n${sections}\n`,
      };

    default:
      return {
        filename: "CLAUDE.md",
        body: PRECEDENCE + `${header}\n${sections}\n`,
      };
  }
}
