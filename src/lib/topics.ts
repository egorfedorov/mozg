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
  { key: "web", label: "Web & frontend", blurb: "Frameworks, components, CSS, the browser." },
  { key: "backend", label: "Backend & APIs", blurb: "Services, databases, queues, contracts." },
  { key: "gamedev", label: "Game development", blurb: "Engines, mechanics, math, pipelines." },
  { key: "mobile", label: "Mobile", blurb: "iOS, Android, React Native, store rules." },
  { key: "ai", label: "AI & agents", blurb: "Models, prompts, tools, evaluation." },
  { key: "data", label: "Data", blurb: "Pipelines, warehouses, analytics, SQL." },
  { key: "devops", label: "DevOps & infra", blurb: "Deploys, containers, cloud, monitoring." },
  { key: "design", label: "Design systems", blurb: "Tokens, components, rules, states." },
  { key: "security", label: "Security", blurb: "Threat models, auth, review checklists." },
  { key: "product", label: "Product & process", blurb: "Specs, conventions, how a team works." },
  { key: "other", label: "Other", blurb: "Everything that fits nowhere else." },
];

export const TOPIC_KEYS = TOPICS.map((t) => t.key);

/** Unknown or missing values degrade to Other rather than blowing up a page. */
export function topicLabel(key: string | null | undefined): string {
  return TOPICS.find((t) => t.key === key)?.label ?? "Other";
}

export function isTopic(key: unknown): key is string {
  return typeof key === "string" && TOPIC_KEYS.includes(key);
}
