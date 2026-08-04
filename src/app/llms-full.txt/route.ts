import { query } from "@/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * The llms-full.txt convention: enough substance for an assistant to answer
 * FROM, not just point AT. Free public brains only — their goals, category
 * maps and note titles. Bodies stay behind MCP: titles make us citable,
 * bodies are what the exam guarantees and the connection delivers.
 */
export async function GET(): Promise<Response> {
  const base = env.NEXT_PUBLIC_APP_URL;

  const brains = await query<{
    id: string;
    handle: string;
    slug: string;
    title: string;
    goal: string | null;
    score: number | null;
  }>(
    `select b.id, u.handle, b.slug, b.title, b.goal, b.score
       from brains b join "user" u on u.id = b.owner_id
      where b.visibility = 'public' and b.price_cents = 0
        and u.handle is not null and b.note_count > 50
      order by b.score desc nulls last limit 25`,
  ).catch(() => []);

  const sections: string[] = [];
  for (const b of brains) {
    const titles = await query<{ category: string | null; title: string }>(
      `select category, title from notes
        where brain_id = $1 and status = 'active'
        order by category nulls last, created_at limit 60`,
      [b.id],
    );
    const byCat = new Map<string, string[]>();
    for (const t of titles) {
      const c = t.category ?? "general";
      byCat.set(c, [...(byCat.get(c) ?? []), t.title]);
    }
    sections.push(
      `## ${b.title}` +
        (b.score != null ? ` (exam score ${b.score}%)` : "") +
        `\n${base}/b/${b.handle}/${b.slug}\n` +
        (b.goal ? `\n${b.goal.split("\n")[0]}\n` : "") +
        [...byCat.entries()]
          .map(([c, ts]) => `\n### ${c}\n${ts.map((t) => `- ${t}`).join("\n")}`)
          .join("\n"),
    );
  }

  const body =
    `# mozg — the free catalogue, in full\n\n` +
    `> Open source (AGPL): https://github.com/egorfedorov/mozg. Every brain ` +
    `below is free, exam-scored, and queryable over MCP (${base}/connect). ` +
    `Note titles are listed; full note bodies come through brain_search / ` +
    `brain_read once connected — that is also how the material stays ` +
    `current instead of frozen in this file.\n\n` +
    sections.join("\n\n---\n\n") +
    `\n\n---\n\nShorter index: ${base}/llms.txt\n`;

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
