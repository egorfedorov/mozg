/**
 * Hold the proposal judge against notes whose answer is known.
 *
 *   npm run judge:proposals:eval
 *
 * Run it before changing a word of the prompt in lib/proposal-judge.ts. The
 * first version scored 3/4: it refused a genuinely general rule because the
 * rule was illustrated with concrete numbers, which is the single most likely
 * way this judge goes wrong — the good notes are the ones with numbers in them.
 * Two of the cases below are real proposals from this catalogue.
 */
import { judgeProposal, autoApprovable } from "@/lib/proposal-judge";

const cases: { name: string; expect: boolean; title: string; body: string }[] = [
  {
    name: "general rule with a project named only as example",
    expect: true,
    title: "Round the paytable amount before applying multipliers",
    body: "Cluster wins must round the paytable amount to the game's step (0.10x) BEFORE applying the cluster and global multipliers. Rounding after multiplying produces a payout below the one the paytable displays: a 0.15x pay multiplied by a tumble x2 and then rounded gives 0.30x where the player was shown 0.40x. Any sanitiser that rewrites book payouts must use the same round-then-multiply order or the book and the paytable disagree.",
  },
  {
    name: "platform constraint",
    expect: true,
    title: "An expected pause reported as an error buries the real failures",
    body: "When a guard stops work deliberately — a spent budget, a quota, a plan limit — throw a distinct error type for it and make both the error centre and the retry policy ignore that type. A plain Error from an expected pause fills the operator's page with rows nobody can act on, and the one real failure is lost among them.",
  },
  {
    name: "measured benchmark",
    expect: true,
    title: "Payment recovery benchmarks",
    body: "Soft decline recovery: poor under 40%, average 50-60%, good 70%+. Hard decline recovery: poor under 10%, average 20-30%, good 40%+. Overall payment recovery: poor under 30%, average 40-50%, good 60%+.",
  },
  {
    name: "project state dressed as a rule",
    expect: false,
    title: "Red Mesa BIG WIN uses win-panel Spine clip big_win",
    body: "Red Mesa Ink win-by-step celebration for BIG is Spine 4.2 at static/assets/red-mesa/spine/fx/win-panel/. Single looping clip name is big_win. Asset key winPanel in assets.ts; Pixi component WinPanelFx mounts when stateVisual.bigWin.",
  },
];

async function main() {
  let wrong = 0;
  for (const c of cases) {
    const v = await judgeProposal(c);
    const got = autoApprovable(v);
    const ok = got === c.expect;
    if (!ok) wrong++;
    console.log(`${ok ? "  ok " : "FAIL "} expected ${c.expect ? "take" : "leave"}, got ${got ? "take" : "leave"} — ${c.name}`);
    if (!ok) console.log(`        ${v.belongs}: ${v.reason}`);
  }
  console.log(`\n${cases.length - wrong}/${cases.length} right\n`);
  process.exit(wrong ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
