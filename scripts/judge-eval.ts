/**
 * Hold the contradiction judge against pairs whose answer is known.
 *
 *   npm run judge:eval
 *
 * worker/contradict.ts says, in the comment above its prompt, that the prompt
 * must be rerun against known pairs before a word of it is changed — and then
 * there was no way to do that, so the check was a note asking a future reader
 * to be careful. This is it. Every pair below is real: the negatives were
 * flagged on /packs/igaming and were not disagreements, the positives are the
 * shapes a genuine conflict takes.
 *
 * Costs a few Haiku calls. It reads no database and writes nothing — the
 * judgement path is `judgePair`, deliberately split from the row it produces
 * for exactly this.
 */
import { judgePair } from "@/worker/contradict";
import { sameClaim } from "@/worker/contradict";

interface Pair {
  name: string;
  /** True when these genuinely conflict. */
  conflict: boolean;
  a: { title: string; body: string };
  b: { title: string; body: string };
}

const PAIRS: Pair[] = [
  {
    name: "run_freespin: 'in sample games' vs 'in ALL sample games'",
    conflict: false,
    a: {
      title: "GameState run_spin required function",
      body: "Every game has a gamestate.py file where independent simulation states are handled. The run_spin() function is required and used as the entry_point from create_books to execute a single simulation. The run_freespin() function is also used in sample games but is not required if the game does not contain a free-spin entry from the base-game.",
    },
    b: {
      title: "gamestate.py required functions",
      body: "Every game has a gamestate.py file where independent simulation states are handled. The run_spin() function is required and used as the entry point from create_books to execute a single simulation. The run_freespin() function is also used in all sample games, though it is not required if the game does not contain a free-spin entry from the base-game.",
    },
  },
  {
    name: "Executables: 'handles' vs 'inherits, including'",
    conflict: false,
    a: {
      title: "Win-evaluation types in Executables",
      body: "The Executables class handles miscellaneous game-logic and board-actions. Win-evaluation types include: Lines, Ways, Scatter (pay anywhere), Cluster, and Expanding wild + prize collection. Additionally, Executables handles tumbling/cascading of winning symbols and Conditions for checking current simulation state.",
    },
    b: {
      title: "Calculations class win-evaluation types",
      body: "The Executables class inherits all miscellaneous game-logic and board-actions, including all win-evaluation types: Lines, Ways, Scatter (pay anywhere), Cluster, and Expanding wild + prize collection. It also handles tumbling/cascading of winning symbols and Conditions for checking current simulation state.",
    },
  },
  {
    name: "RNG seeding: one side also mentions the self.repeat loop",
    conflict: false,
    a: {
      title: "RNG seeding for reproducibility",
      body: "The RNG is seeded with the simulation number via reset_seed(sim) to ensure reproducibility. Betmode distribution criteria are preassigned to each simulation number, requiring self.repeat to loop until spin completion verifies criteria-specific conditions and win amounts are satisfied.",
    },
    b: {
      title: "RNG seeding with simulation number for reproducibility",
      body: "For reproducibility, the RNG is seeded with the simulation number in the reset_seed(sim) call. Betmode distribution criteria are preassigned to each simulation number before the spin runs.",
    },
  },
  {
    name: "two SDK versions, each correct about itself",
    conflict: false,
    a: {
      title: "Pixi v7 application setup",
      body: "In PixiJS 7 the application is constructed synchronously: `const app = new Application({ width, height })`, and the canvas is available immediately as app.view.",
    },
    b: {
      title: "Pixi v8 application setup",
      body: "In PixiJS 8 the application must be initialised asynchronously: construct it with `new Application()` and then `await app.init({ width, height })`. The canvas is app.canvas.",
    },
  },
  {
    name: "a general rule beside its exception",
    conflict: false,
    a: {
      title: "Books are uploaded compressed",
      body: "Every book file uploaded to the Admin Control Panel must be zstd-compressed, with the .jsonl.zst extension.",
    },
    b: {
      title: "Uncompressed books during local development",
      body: "While developing locally the books can be left uncompressed as plain .jsonl, because the local server reads either. Only what is uploaded has to be compressed.",
    },
  },
  {
    name: "a real conflict: the same limit with different numbers",
    conflict: true,
    a: {
      title: "Max win cap",
      body: "The win cap for a standard mode is 5000x the bet, and the simulation must stop accumulating once it is reached.",
    },
    b: {
      title: "Max win cap",
      body: "The win cap for a standard mode is 10000x the bet, and the simulation must stop accumulating once it is reached.",
    },
  },
  {
    name: "a real conflict: opposite instructions for one endpoint",
    conflict: true,
    a: {
      title: "Ending a round",
      body: "Call end-round after every play call, including the ones that returned a zero payout, or the session is left open.",
    },
    b: {
      title: "Ending a round",
      body: "Do not call end-round when the play call returned a zero payout — the RGS closes those itself and a second call is rejected.",
    },
  },
  {
    name: "a real conflict: required against optional",
    conflict: true,
    a: {
      title: "Replay before submission",
      body: "A working replay endpoint is required before a game can be submitted for review; reviewers test it themselves.",
    },
    b: {
      title: "Replay before submission",
      body: "A replay endpoint is optional at submission and can be added after approval, as long as it ships before launch.",
    },
  },
];

async function main() {
  let wrong = 0;
  let cents = 0;

  for (const p of PAIRS) {
    const { verdict, costCents } = await judgePair(p.a, p.b);
    cents += costCents;

    // The filter is part of the answer the pipeline gives, so it is part of
    // what is measured: a verdict the judge got wrong and sameClaim catches
    // is a pair this system gets right.
    const filtered =
      verdict.contradicts &&
      Boolean(verdict.claim_a && verdict.claim_b) &&
      sameClaim(verdict.claim_a!, verdict.claim_b!);
    const said = verdict.contradicts && !filtered;

    const ok = said === p.conflict;
    if (!ok) wrong++;
    console.log(
      `${ok ? "  ok " : "FAIL "} ${p.conflict ? "conflict " : "innocent "} ` +
        `→ said ${said ? "conflict" : "innocent"}${filtered ? " (filtered)" : ""}  ${p.name}`,
    );
    if (said) {
      console.log(`         subject: ${verdict.subject}`);
      console.log(`         a: ${verdict.claim_a}`);
      console.log(`         b: ${verdict.claim_b}`);
    }
  }

  console.log(
    `\n${PAIRS.length - wrong}/${PAIRS.length} right, ${cents.toFixed(2)}¢\n`,
  );
  process.exit(wrong ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
