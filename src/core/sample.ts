/**
 * The sample session the landing shows.
 *
 * Every number on the landing comes from here and is labelled as a sample. It
 * goes through the same view-model as the real desk, so what a visitor sees is
 * what they will get, and nothing on the page is a hand-written claim.
 */

import { moduleOf, risksOf, weightOf } from "./change";
import { buildDeskState } from "./desk";
import { t } from "@/lib/i18n";
import { SAMPLE_EXPLAINS, type SampleExplain } from "@/content/sample-texts";
import { addDays, dayKey } from "./time";
import type { Change, Explain } from "./types";

/** Fixed, so two builds of the landing show the same board. */
export const SAMPLE_NOW = new Date(2026, 10, 25, 15, 27, 0);
export const SAMPLE_PROJECT = "/Users/ada/forge";

const SOURCE = { path: "", offset: 0, length: 0 };

interface Spec {
  file: string;
  added: number;
  removed: number;
  tool?: Change["tool"];
  approvedBy?: Change["approvedBy"];
  goAheadMs?: number | null;
  day?: number;
  hour: number;
  minute: number;
  session?: string;
}

const TODAY: Spec[] = [
  { file: "src/payments/charge.ts", added: 80, removed: 12, approvedBy: "auto", goAheadMs: 1200, hour: 9, minute: 12 },
  { file: "src/payments/charge.ts", added: 28, removed: 29, approvedBy: "auto", goAheadMs: 900, hour: 9, minute: 19 },
  { file: "src/auth/session.ts", added: 31, removed: 9, approvedBy: "user", goAheadMs: 48_000, hour: 9, minute: 34 },
  { file: "src/db/migrations/0042_ledger.sql", added: 30, removed: 0, tool: "write", approvedBy: "auto", goAheadMs: 1400, hour: 9, minute: 52 },
  { file: "src/api/routes.ts", added: 74, removed: 18, approvedBy: "user", goAheadMs: 61_000, hour: 10, minute: 40 },
  { file: "src/api/routes.ts", added: 40, removed: 22, approvedBy: "user", goAheadMs: 12_000, hour: 11, minute: 1 },
  { file: "src/storage/objects.ts", added: 52, removed: 28, approvedBy: "user", goAheadMs: 7_500, hour: 13, minute: 6 },
  { file: "src/auth/session.ts", added: 34, removed: 15, approvedBy: "user", goAheadMs: 5200, hour: 15, minute: 2, session: "s-evening" },
];

const EARLIER: Spec[] = [
  { file: "src/payments/refund.ts", added: 60, removed: 30, approvedBy: "auto", goAheadMs: 1100, day: -1, hour: 11, minute: 5 },
  { file: "src/ui/board.tsx", added: 44, removed: 10, approvedBy: "auto", goAheadMs: 800, day: -1, hour: 15, minute: 40 },
  { file: "src/api/routes.ts", added: 20, removed: 6, approvedBy: "user", goAheadMs: 9_000, day: -1, hour: 16, minute: 2 },
  { file: "src/payments/charge.ts", added: 90, removed: 40, approvedBy: "auto", goAheadMs: 1300, day: -2, hour: 10, minute: 30 },
  { file: ".github/workflows/ci.yml", added: 12, removed: 4, approvedBy: "auto", goAheadMs: 700, day: -2, hour: 14, minute: 0 },
  { file: "src/ui/board.tsx", added: 35, removed: 22, approvedBy: "auto", goAheadMs: 900, day: -2, hour: 17, minute: 15 },
  { file: "src/storage/objects.ts", added: 18, removed: 9, approvedBy: "user", goAheadMs: 21_000, day: -3, hour: 9, minute: 45 },
  { file: "src/api/routes.ts", added: 26, removed: 11, approvedBy: "user", goAheadMs: 14_000, day: -3, hour: 10, minute: 50 },
  { file: "src/payments/charge.ts", added: 50, removed: 25, approvedBy: "auto", goAheadMs: 1000, day: -4, hour: 13, minute: 20 },
  { file: "src/ui/board.tsx", added: 22, removed: 8, approvedBy: "auto", goAheadMs: 600, day: -5, hour: 10, minute: 10 },
  { file: "next.config.ts", added: 14, removed: 3, approvedBy: "user", goAheadMs: 33_000, day: -5, hour: 12, minute: 0 },
  { file: "src/auth/session.ts", added: 24, removed: 12, approvedBy: "user", goAheadMs: 52_000, day: -6, hour: 15, minute: 30 },
  { file: "src/api/routes.ts", added: 31, removed: 14, approvedBy: "user", goAheadMs: 8_000, day: -7, hour: 11, minute: 0 },
  { file: "src/storage/objects.ts", added: 40, removed: 18, approvedBy: "user", goAheadMs: 19_000, day: -8, hour: 16, minute: 45 },
];

function change(n: number, s: Spec): Change {
  const at = addDays(SAMPLE_NOW, s.day ?? 0);
  at.setHours(s.hour, s.minute, 0, 0);
  const risks = risksOf(s.file, s.added, s.removed, "");
  return {
    id: `sample-${n}`,
    toolUseId: `toolu_sample_${n}`,
    session: s.session ?? `s-${s.day ?? 0}-${n}`,
    project: SAMPLE_PROJECT,
    file: s.file,
    module: moduleOf(s.file),
    tool: s.tool ?? "edit",
    at: at.toISOString(),
    added: s.added,
    removed: s.removed,
    // The same rules the real reader applies, so the sample cannot claim a
    // weight the product would not give.
    weight: weightOf(risks),
    risks,
    goAheadMs: s.goAheadMs === undefined ? 4200 : s.goAheadMs,
    approvedBy: s.approvedBy ?? "auto",
    source: SOURCE,
  };
}

function explain(n: number, s: SampleExplain, id: (file: string, day: number) => string): Explain {
  const at = addDays(SAMPLE_NOW, s.day);
  at.setHours(s.hour, 6, 0, 0);
  return {
    id: `sample-x-${n}`,
    change: s.gone ? "sample-gone" : id(s.file, s.day),
    project: SAMPLE_PROJECT,
    module: moduleOf(s.file),
    // Written for the sample and marked for translation like any other sentence.
    question: t(s.question),
    answer: t(s.answer),
    verdict: s.verdict,
    why: t(s.why),
    lesson: s.lesson ? t(s.lesson) : null,
    evidence: null,
    bug: s.bug ? { found: true, note: t(s.bug) } : null,
    at: at.toISOString(),
    examiner: "sample",
  };
}

export function sampleStore(): { changes: Change[]; explains: Explain[] } {
  const changes = [...TODAY, ...EARLIER].map((s, i) => change(i, s));
  const id = (file: string, day: number) => {
    const at = dayKey(addDays(SAMPLE_NOW, day));
    return changes.find((c) => c.file === file && dayKey(new Date(c.at)) === at)?.id ?? changes[0].id;
  };
  const explains: Explain[] = SAMPLE_EXPLAINS.map((spec, i) => explain(i + 1, spec, id));
  return { changes, explains };
}

/** The desk as the landing shows it: the sample session, through the same code as a real one. */
export function sampleDesk(): ReturnType<typeof buildDeskState> {
  // The one thing that is not computed: the mark that says this is a sample.
  return { ...buildDeskState({ ...sampleStore(), now: SAMPLE_NOW }), sample: true };
}
