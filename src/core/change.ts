/**
 * Lines, risk and the module a file belongs to.
 *
 * A module is what a person explains once: a folder, roughly. It is derived
 * from the path alone, on purpose. A clustering model would find truer
 * boundaries and move them every time it ran, and a module that is "payments"
 * today and "billing-core" tomorrow is not something a person can own.
 */

import type { Risk } from "./types";

/** Lines in a string. "a\nb" is two; "a\nb\n" is two as well. */
export function countLines(text: string | undefined | null): number {
  if (!text) return 0;
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return text.endsWith("\n") ? n : n + 1;
}

const CONTAINERS = new Set([
  "src", "app", "lib", "libs", "packages", "apps", "internal", "cmd", "pkg",
  "pkgs", "crates", "server", "client", "web", "api", "core", "components",
  "pages", "routes", "services", "modules", "extensions",
]);

export const ROOT_MODULE = "(root)";

/** `src/app/layout.tsx` → `src/app`; `README.md` → `(root)`. */
export function moduleOf(relativePath: string): string {
  const parts = relativePath
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);
  if (!parts.length || parts.length === 1) return ROOT_MODULE;
  // A migrations folder is its own thing to explain, however deep it sits:
  // what a migration does to existing rows is a different question from what
  // the schema around it means.
  const migrations = parts.findIndex((p) => /^migrations?$/i.test(p));
  if (migrations > 0) return parts.slice(0, migrations + 1).join("/").toLowerCase();
  const first = parts[0].toLowerCase();
  if (parts.length >= 3 && CONTAINERS.has(first)) return `${first}/${parts[1].toLowerCase()}`;
  return first;
}

/** The path as shown: relative to the project, with the home folder folded. */
export function displayPath(absolute: string, project: string): string {
  const p = absolute.replace(/\\/g, "/");
  const root = project.replace(/\\/g, "/").replace(/\/$/, "");
  if (root && (p === root || p.startsWith(root + "/"))) return p.slice(root.length + 1);
  const home = (process.env.HOME || "").replace(/\/$/, "");
  if (home && p.startsWith(home + "/")) return `~/${p.slice(home.length + 1)}`;
  return p;
}

const RULES: { risk: Risk; test: RegExp }[] = [
  { risk: "migration", test: /(^|\/)migrations?\/|\bmigrate[d]?\b|\.sql$/i },
  { risk: "schema", test: /(^|\/)(schema|models?|entities|types)\b|\.prisma$|schema\.[a-z]+$/i },
  { risk: "auth", test: /auth|login|sign[-_]?in|session|password|passport|oauth|jwt|permission|rbac|acl/i },
  { risk: "payments", test: /payment|billing|checkout|invoice|charge|subscri|stripe|paddle|lemon ?squeezy|wallet|ledger/i },
  { risk: "config", test: /(^|\/)(\.env[^/]*|dockerfile[^/]*|docker-compose[^/]*|compose\.[a-z.]+|[^/]*\.config\.[cm]?[jt]s|[^/]*\.toml|package\.json|[^/]*lock[^/]*|\.github\/.*|Makefile)$/i },
  { risk: "tests", test: /(^|\/)(tests?|__tests__|spec|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$|_test\.go$|test_[^/]*\.py$/i },
];

export const RISK_WEIGHT: Record<Risk, number> = {
  migration: 2.5,
  schema: 2,
  auth: 2,
  payments: 2,
  config: 1.5,
  tests: 0.5,
  size: 1.5,
  docs: 0,
};

/** A change this big is read differently from a one-liner, wherever it lands. */
export const SIZE_LINES = 80;

/**
 * A file that holds words and nothing else: a README, a licence, a changelog.
 * Nobody has to explain a sentence to own a module, so a change in one is
 * noted and counted for nothing: not in the score, not on the map, not worth
 * a question, and not put to the person before it happens.
 */
// By the name of the file when it has no language of its own (README, LICENSE.txt), and
// never by a name that only begins a file: readme.ts is code.
const WORDS = /(^|\/)(readme|changelog|license|licence|copying|authors|contributors|notice)(\.txt)?$|\.(md|mdx|markdown|mdown|rst)$/i;

export const isWords = (relativePath: string): boolean => WORDS.test(relativePath);

/** What makes this change worth a person's minute. */
export function risksOf(relativePath: string, added: number, removed: number, text: string): Risk[] {
  // Words are words, whatever they quote.
  if (isWords(relativePath)) return ["docs"];
  const out: Risk[] = [];
  for (const { risk, test } of RULES) if (test.test(relativePath)) out.push(risk);
  // SQL inside code is still a migration, wherever the file lives.
  if (!out.includes("migration") && /\b(alter|create|drop)\s+table\b|\badd\s+column\b/i.test(text)) {
    out.push("migration");
  }
  // A test file that is also large is only a test: the smaller weight wins.
  if (!out.includes("tests") && added + removed >= SIZE_LINES) out.push("size");
  return out;
}

/** Multiply the size by every risk except the ones that lower it. */
export function weightOf(risks: Risk[]): number {
  if (risks.includes("docs")) return 0;
  let w = 1;
  for (const r of risks) if (r !== "tests") w *= RISK_WEIGHT[r];
  if (risks.includes("tests")) w *= RISK_WEIGHT.tests;
  return Math.max(0.5, w);
}

/** Lines counted the way ownership counts them. */
export function weightedLines(added: number, removed: number, weight: number): number {
  return (added + removed) * weight;
}
