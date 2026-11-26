/**
 * The words of the sample session: the questions, the answers, the examiner's
 * reasons and lessons. Kept here, and not beside the numbers they belong to,
 * because of the folder's one rule: a string in double quotes is a sentence and
 * is translated. On the landing and on the desk these are read by people, in
 * their language.
 *
 * Each entry is one explain-back: which file, how many days before the sample
 * moment and at what hour, the verdict, and the words.
 */

import type { Verdict } from "@/core/types";

export interface SampleExplain {
  file: string;
  day: number;
  hour: number;
  verdict: Verdict;
  question: string;
  answer: string;
  why: string;
  lesson?: string;
  bug?: string;
  /** The change itself is older than the logs that are kept. */
  gone?: true;
}

export const SAMPLE_EXPLAINS: SampleExplain[] = [
  {
    file: 'src/api/routes.ts', day: -3, hour: 11, verdict: 'explained',
    question: "In src/api/routes.ts the retry wrapper now gives up after three attempts. Why three, and what happens to the request that was on its fourth?",
    answer: "Three keeps a slow dependency from holding the connection for more than about two seconds. The fourth request gets a 503, and the client's own retry picks it up a moment later.",
    why: "Names the limit, the reason for it, and what the caller sees when it is reached.",
  },
  {
    file: 'src/api/routes.ts', day: -1, hour: 16, verdict: 'explained',
    question: "Yesterday src/api/routes.ts started reading the tenant from the session instead of the path. Where does the value in the path go now?",
    answer: "It is ignored when the tenant is chosen and only kept for the link in the response. A path that names another tenant gets a 404, not that tenant's data.",
    why: "Says where the tenant comes from now and what a mismatched path does.",
  },
  {
    file: 'src/api/routes.ts', day: 0, hour: 11, verdict: 'explained',
    question: "In src/api/routes.ts the list handler now returns early when the page is empty. What did the old code do in that case, and who notices the difference?",
    answer: "It used to fall through and still write an empty batch to the log, so the nightly job had something to count. The early return skips that write, and the job sees nothing for the day.",
    why: "Names the behaviour the change removed and what downstream depends on it.",
    bug: "The early return dropped the empty batch the nightly job counts on. You caught it before it shipped.",
  },
  {
    file: 'src/auth/session.ts', day: -6, hour: 16, verdict: 'not_yet',
    question: "src/auth/session.ts now rotates the refresh token on every use. What rejects a token that was already used?",
    answer: "Hmm. The token gets a new value each time, and I think the old one is deleted. I'm not sure what happens if two requests refresh at once.",
    why: "Guesses where the check lives and does not say what a replayed token does.",
    lesson:
    "A replayed token is refused by the session row. Using a refresh token writes its successor there, so a second request holding the old one finds it replaced and is turned away. Two requests refreshing at once are decided by that write: the first wins, the second signs in again.",
  },
  {
    file: 'src/auth/session.ts', day: 0, hour: 10, verdict: 'explained',
    question: "This morning src/auth/session.ts started checking the session's age against a server-side clock. What does that stop?",
    answer: "A client that sets its own clock back can no longer keep an expired session alive: the server compares against its own time and ends the session at the real deadline.",
    why: "Says what the check defends against and where the trusted time comes from.",
  },
  {
    file: 'src/storage/objects.ts', day: -3, hour: 12, verdict: 'explained',
    question: "src/storage/objects.ts now deletes the local file after the upload succeeds. What if the process dies between the two?",
    answer: "The row keeps the local path, so the next sweep finds the file, checks that the bucket holds the same checksum, and only then deletes it.",
    why: "Names the window and the step that closes it.",
  },
  {
    gone: true, file: 'src/payments/charge.ts', day: -9, hour: 10, verdict: 'explained',
    question: "src/payments/charge.ts now retries a failed capture once. What stops a customer being charged twice?",
    answer: "Both attempts carry the same idempotency key, so the provider answers the second call with the first result instead of running it again.",
    why: "Names the mechanism and its effect on the second attempt.",
  },
  {
    file: 'src/ui/board.tsx', day: -8, hour: 10, verdict: 'explained',
    question: "src/ui/board.tsx now renders the rows from a memo. When does the memo recompute?",
    answer: "Only when the rows array's identity changes. Sorting in place will not redraw the board, so the sort has to return a new array.",
    why: "Says what the memo depends on and the mistake that follows from it.",
  },
  {
    file: 'src/ui/board.tsx', day: -2, hour: 18, verdict: 'explained',
    question: "In src/ui/board.tsx the empty state moved into its own component. What does it render while the rows are still loading?",
    answer: "Nothing. The parent shows the skeleton until the first fetch settles, and the empty state only appears when the fetch came back with no rows.",
    why: "Separates loading from empty, and says where each is decided.",
  },
];
