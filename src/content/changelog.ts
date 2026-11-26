/**
 * What has shipped, newest first, and what is planned.
 *
 * The same rule as everywhere in this folder: double quotes are sentences and
 * are translated, single quotes are names and are left alone.
 *
 * Two kinds of entry. A shipped one has a date and a version, and says what
 * the code does. A planned one has neither, and is marked planned wherever it
 * is shown: a changelog that lists intentions as releases is an advertisement.
 */

export interface Entry {
  /** ISO day, or null for what is planned. */
  date: string | null;
  version: string | null;
  title: string;
  summary: string;
  items: { kind: 'new' | 'improved' | 'fixed' | 'planned'; text: string }[];
}

export const CHANGELOG: Entry[] = [
  {
    date: '2026-11-26',
    version: '2.0.0',
    title: "The first release",
    summary:
      "mozg reads what your coding agent changed, asks you one question about the part with the most at stake, and makes a module yours when you can explain it.",
    items: [
      { kind: 'new', text: "Watch. Every edit your agent makes is read from the logs Claude Code already writes, with who let it through." },
      { kind: 'new', text: "The explain-back. One question, your own words, and an examiner that did not write the code." },
      { kind: 'new', text: "The gate. Where a module is not yours, the agent's first edit there in a session asks you first." },
      { kind: 'new', text: "A miss comes with a lesson, and the same question once more." },
      { kind: 'new', text: "The desk, on 127.0.0.1 only: the score, the feed, the map, the rules and the history." },
      { kind: 'new', text: "Re-checks after 1, 3, 7, 14 and 30 days. A module stops being yours once the agent has rewritten it." },
      { kind: 'new', text: "Connection and settings on the desk: whether the plugin is attached, the nudge, the gate, and hidden projects." },
      { kind: 'new', text: "This site: the landing, the pricing, the questions, this changelog and the documentation." },
      { kind: 'fixed', text: "A session log longer than one read used to stop early and be counted as finished. It is read to its end now." },
      { kind: 'fixed', text: "Three readers starting together on a first session no longer write the same change twice." },
    ],
  },
  {
    date: null,
    version: null,
    title: "What comes next",
    summary: "Planned, in the order it is meant to be built. Not here yet.",
    items: [
      { kind: 'planned', text: "A check before you push, and a receipt on the pull request." },
      { kind: 'planned', text: "Your own words, kept for each module: what you said when you understood it." },
      { kind: 'planned', text: "A card for the week, to keep or to share." },
      { kind: 'planned', text: "Codex and Cursor, whose logs have other shapes." },
    ],
  },
];

/** The kinds of item, as a word. */
export const ITEM_KIND: Record<Entry['items'][number]['kind'], string> = {
  new: "New",
  improved: "Improved",
  fixed: "Fixed",
  planned: "Planned",
};
