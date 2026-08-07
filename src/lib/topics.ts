import { msg } from "@/lib/msg";
/**
 * What field a brain belongs to. Pure data, no DB import — the catalogue, the
 * create form and the admin table all read this one list.
 *
 * Named for what a developer would say they work on, not for our taxonomy.
 * Order is browsing order; "other" stays last.
 */
export interface Topic {
  key: string;
  label: string;
  /** One line for the catalogue header — what belongs in here. */
  blurb: string;
}

export const TOPICS: Topic[] = [
  { key: "web", label: msg("Web & frontend"), blurb: msg("Frameworks, components, CSS, the browser.") },
  { key: "backend", label: msg("Backend & APIs"), blurb: msg("Services, databases, queues, contracts.") },
  { key: "gamedev", label: msg("Game development"), blurb: msg("Engines, mechanics, math, pipelines.") },
  { key: "mobile", label: msg("Mobile"), blurb: msg("iOS, Android, React Native, store rules.") },
  { key: "ai", label: msg("AI & agents"), blurb: msg("Models, prompts, tools, evaluation.") },
  { key: "data", label: msg("Data"), blurb: msg("Pipelines, warehouses, analytics, SQL.") },
  { key: "devops", label: msg("DevOps & infra"), blurb: msg("Deploys, containers, cloud, monitoring.") },
  { key: "design", label: msg("Design systems"), blurb: msg("Tokens, components, rules, states.") },
  { key: "security", label: msg("Security"), blurb: msg("Threat models, auth, review checklists.") },
  { key: "product", label: msg("Product & process"), blurb: msg("Specs, conventions, how a team works.") },
  {
    key: "craft",
    label: msg("Art & craft"),
    blurb: msg("An artist's own rules: palette, composition, motifs, what to avoid."),
  },
  { key: "other", label: msg("Other"), blurb: msg("Everything that fits nowhere else.") },
];

export const TOPIC_KEYS = TOPICS.map((t) => t.key);

/** Unknown or missing values degrade to Other rather than blowing up a page. */
/**
 * The label, still English — callers pass it through their own `t()`. The
 * fallback is marked so "Other" is translated too rather than being the one
 * word on a translated page that is not.
 */
export function topicLabel(key: string | null | undefined): string {
  return TOPICS.find((t) => t.key === key)?.label ?? msg("Other");
}

export function isTopic(key: unknown): key is string {
  return typeof key === "string" && TOPIC_KEYS.includes(key);
}
