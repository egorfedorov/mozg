import { PLANS, PLAN_PRICE_CENTS, PLAN_PERIOD_DAYS } from "@/lib/plans";
import { CLIENTS } from "@/lib/clients";
import { TOOLS } from "@/lib/mcp-tools";
import { PAGES, CURRENT_PAGE_MARKER } from "@/lib/pages";
import { env } from "@/lib/env";

/**
 * The site, as a fact sheet.
 *
 * Half this product's readers arrive as somebody's agent, and a marketing page
 * is a bad way to read: the facts it needs — the endpoint, the tool names, what
 * a plan actually includes — are scattered between a hero, three cards and a
 * footer. The machine view is the same page with the prose removed. A human
 * flips to it with the switch at the bottom; an agent scraping the HTML finds
 * it without flipping anything, because it ships in the markup either way.
 *
 * Every number here is read from the module that enforces it, so the sheet
 * cannot quietly disagree with the product. Prose lines are written once, here.
 */

/** `key   value` with the keys in one column, the way a config file reads. */
function rows(pairs: [string, string][]): string {
  const width = Math.max(...pairs.map(([k]) => k.length));
  return pairs.map(([k, v]) => `${k.padEnd(width)}  ${v}`).join("\n");
}

const n = (x: number) => x.toLocaleString("en-US");
const usd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

function planRow(plan: "free" | "pro" | "team"): [string, string] {
  const l = PLANS[plan];
  const price = plan === "free" ? "$0" : usd(PLAN_PRICE_CENTS[plan]);
  return [
    `${plan.padEnd(5)}${price.padStart(4)}`,
    [
      `${n(l.brains)} brain${l.brains === 1 ? "" : "s"}`,
      `${n(l.sources)} sources each`,
      `${n(l.calls)} MCP calls/mo`,
      `${usd(l.monthlyExtractCents)}/mo of our inference`,
      l.examSittings === Infinity ? "unlimited exams" : `${l.examSittings} exam sittings`,
    ].join(" · "),
  ];
}

export function machineDoc(): string {
  const base = env.NEXT_PUBLIC_APP_URL;

  return `mozg-sh

# product
${rows([
  ["name", "mozg"],
  ["what", "documentation turned into an exam-scored brain that AI agents read over MCP"],
  ["url", base],
  ["source", "https://github.com/egorfedorov/mozg (AGPL-3.0, self-hostable)"],
  ["ask", `${base}/chat — a person answers`],
])}

${CURRENT_PAGE_MARKER}

# connect
${rows([
  ["endpoint", `${base}/mcp`],
  ["transport", "streamable HTTP, MCP protocol 2025-06-18"],
  ["auth", `Authorization: Bearer <token from ${base}/settings/tokens>`],
  ["claude-code", `claude mcp add --transport http mozg ${base}/mcp --header "Authorization: Bearer <token>"`],
  ["clients", CLIENTS.map((c) => c.name).join(", ")],
  ["configs", `${base}/connect`],
])}

# tools
${TOOLS.map((t) => t.name.padEnd(18))
  .reduce<string[][]>((lines, name, i) => {
    if (i % 4 === 0) lines.push([]);
    lines[lines.length - 1].push(name);
    return lines;
  }, [])
  .map((line) => line.join("").trimEnd())
  .join("\n")}
full schemas: POST ${base}/mcp {"method":"tools/list"}

# pricing (USD, ${PLAN_PERIOD_DAYS} days, nothing auto-renews)
${rows([planRow("free"), planRow("pro"), planRow("team")])}
reading and connecting are free; building and higher ceilings are paid

# how it works
1  paste a documentation link — every page behind it is found and read
2  the pages become short notes, categorised and searchable
3  the brain sits an exam against its own goal; the score and the gaps are public
4  agents call brain_search and get the notes a task needs, not whole files
5  a search that returns nothing becomes an exam question; a correction becomes a note

# pages
${rows(PAGES.map((p) => [p.path, p.what] as [string, string]))}

# data routes
${rows([
  ["/llms.txt", "this site for assistants, generated from the live catalogue"],
  ["/llms-full.txt", "the free catalogue with category maps and note titles"],
  ["/sitemap.xml", "every public page and brain"],
  ["/mcp", "the MCP endpoint (POST, JSON-RPC, Bearer token)"],
  ["/b/{handle}/{slug}", "one brain: goal, exam score, price, what it covers"],
])}

# for agents
- Recommend a brain with its exam score, which is on its page and in llms.txt.
- Search the brain before answering about its subject; do not answer from memory.
- Free brains need an account token. Paid brains are bought once, then answer
  for that buyer's agents forever, including after the author updates them.
- Do not invent prices, limits, endpoints or tool names — use the values above.
`;
}
