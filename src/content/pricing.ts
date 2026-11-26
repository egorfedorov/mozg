/**
 * The plans, in one place.
 *
 * The same rule as everywhere in this folder: double quotes are sentences and
 * are translated, single quotes are names and are left alone.
 *
 * A price here is a number, never a string with a currency sign in it: the
 * sentence around it is translated, and says the currency its own way.
 *
 * Nothing is listed as Pro or Team before it exists. A feature that is still
 * to be built is marked planned here, and shown planned on the page.
 */

export interface Feature {
  text: string;
  planned?: boolean;
}

export interface Plan {
  id: 'free' | 'pro' | 'team';
  name: string;
  /** Who it is for, in one line. */
  who: string;
  /** Dollars a month and a year. Null when there is no price yet. */
  monthly: number | null;
  yearly: number | null;
  /** Priced for each person on the team. */
  perSeat: boolean;
  sold: 'now' | 'soon' | 'later';
  /** What the button says. */
  cta: string;
  note: string;
  features: Feature[];
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: "Free",
    who: "For everyone, to start and to keep going.",
    monthly: 0,
    yearly: 0,
    perSeat: false,
    sold: 'now',
    cta: "Install",
    note: "No account. No key. Nothing to pay.",
    features: [
      { text: "Every change your agent makes, read from the logs Claude Code already writes" },
      { text: "Unlimited explain-backs, graded by an examiner that did not write the code" },
      { text: "The lesson after a miss" },
      { text: "The gate: where a module is not yours, the agent asks first" },
      { text: "The desk, on your own machine" },
      { text: "Re-checks, the streak, and the day in lines" },
    ],
  },
  {
    id: 'pro',
    name: "Pro",
    who: "For people who work with more than one agent, or want more than the default rules.",
    monthly: 5,
    yearly: 49,
    perSeat: false,
    sold: 'soon',
    cta: "Not on sale yet",
    note: "When it is: it keeps working if you cancel. There is no server to pay for.",
    features: [
      { text: "Everything in Free" },
      { text: "Codex and Cursor, beside Claude Code", planned: true },
      { text: "A check before you push, and a receipt on the pull request", planned: true },
      { text: "Re-check intervals and risk rules of your own", planned: true },
      { text: "A report for the week", planned: true },
    ],
  },
  {
    id: 'team',
    name: "Team",
    who: "For a team that wants to know which of its modules its people can vouch for.",
    monthly: null,
    yearly: null,
    perSeat: true,
    sold: 'later',
    cta: "Coming later",
    note: "Priced per seat.",
    features: [
      { text: "Everything in Pro" },
      { text: "One map for the whole repository", planned: true },
      { text: "A receipt on each pull request", planned: true },
      { text: "Only what was explained leaves a machine, never the code", planned: true },
    ],
  },
];

/** A cell of the comparison table: true, false, or planned. */
export type Have = boolean | 'planned';

export const COMPARE: { feature: string; free: Have; pro: Have; team: Have }[] = [
  { feature: "The ownership score and the desk", free: true, pro: true, team: true },
  { feature: "Explain-backs with the examiner, and the lesson after a miss", free: true, pro: true, team: true },
  { feature: "The gate: the agent asks first where a module is not yours", free: true, pro: true, team: true },
  { feature: "Codex and Cursor, beside Claude Code", free: false, pro: 'planned', team: 'planned' },
  { feature: "A check before you push", free: false, pro: 'planned', team: 'planned' },
  { feature: "Re-check intervals and risk rules of your own", free: false, pro: 'planned', team: 'planned' },
  { feature: "A report for the week", free: false, pro: 'planned', team: 'planned' },
  { feature: "One map for the whole team", free: false, pro: false, team: 'planned' },
  { feature: "A receipt on each pull request", free: false, pro: 'planned', team: 'planned' },
];
