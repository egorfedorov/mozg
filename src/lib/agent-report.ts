import { query } from "@/db";

/**
 * The agent report card, computed rather than claimed.
 *
 * Attribution chain: an agent writes a note (author='agent', agent_client
 * says which tool), exams record which notes were the evidence behind each
 * verdict (check_results.evidence, 0063), so "the notes Claude Code wrote
 * were the evidence in 12 passing answers" is a join, not a vibe. Citations
 * accumulate as brains re-sit — a fresh contribution shows notes first and
 * earns its citations at the next sitting.
 */

export interface AgentTaught {
  /** Which tool wrote — "claude-code", "codex", or "agent" when unlabelled. */
  client: string;
  /** Active notes this agent contributed to the scope. */
  notes: number;
  /** Verdicts where its notes were evidence, split by outcome. */
  citedPass: number;
  citedTotal: number;
}

export async function agentsTaught(scope: string[]): Promise<AgentTaught[]> {
  if (!scope.length) return [];

  const contributions = await query<{ client: string; notes: number }>(
    `select coalesce(agent_client, 'agent') as client, count(*)::int as notes
       from notes
      where brain_id = any($1::uuid[]) and author = 'agent' and status = 'active'
      group by 1`,
    [scope],
  );
  if (!contributions.length) return [];

  const citations = await query<{ client: string; cited_pass: number; cited_total: number }>(
    `with latest as (
       select distinct on (brain_id) id from check_runs
        where status = 'done' and brain_id = any($1::uuid[])
        order by brain_id, started_at desc)
     select coalesce(n.agent_client, 'agent') as client,
            count(*) filter (where r.passed)::int as cited_pass,
            count(*)::int as cited_total
       from check_results r
       join latest l on l.id = r.run_id
       cross join lateral unnest(coalesce(r.evidence, '{}')) as e(note_id)
       join notes n on n.id = e.note_id
      where n.author = 'agent'
      group by 1`,
    [scope],
  );
  const byClient = new Map(citations.map((c) => [c.client, c]));

  return contributions
    .map((c) => ({
      client: c.client,
      notes: c.notes,
      citedPass: byClient.get(c.client)?.cited_pass ?? 0,
      citedTotal: byClient.get(c.client)?.cited_total ?? 0,
    }))
    .sort((a, b) => b.notes - a.notes);
}
