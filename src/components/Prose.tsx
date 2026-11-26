import type { ReactNode } from "react";

/**
 * The things in a sentence that are not words.
 *
 *   ~/…            a path from the home folder
 *   http(s)://…    an address, with its port and its path, without the punctuation that closes the sentence
 *   a/b, a.b/c     a path or a file
 *   --flag         an option of a command
 *   127.0.0.1      an address made of numbers: four of them, with a port perhaps
 *   1.2.3          a version
 *
 * Each is one whole. "127.0.0.1" used to be taken for a version with something
 * left over ("127.0.0" and then ".1"), and an address lost everything after its
 * first dot ("http://127", ".0.0.1", ":4317"), each piece in a box of its own.
 *
 * The closing marks that may follow are left out in every language's way of
 * quoting and of marking a link: » ” ’ 」 』 [ ] < > included.
 */
const CLOSE = String.raw`\s,;:…()"'»›”’」』\[\]<>`;
const NOT_A_WORD = new RegExp(
  String.raw`(~\/(?:[^${CLOSE}]*[^${CLOSE}.])?` +
    String.raw`|https?:\/\/[A-Za-z0-9~%-](?:[A-Za-z0-9.\-~%]*[A-Za-z0-9~%-])?(?::\d+)?(?:\/(?:[^${CLOSE}]*[^${CLOSE}.])?)?` +
    String.raw`|(?<![\w/.])[\w.@-]+\/[\w@.:/-]*[\w@):-]` +
    String.raw`|(?<![\w-])--[a-z][a-z-]+` +
    String.raw`|\b\d{1,3}(?:\.\d{1,3}){3}\b(?::\d+)?` +
    String.raw`|\b\d+\.\d+\.\d+\b)`,
  "g",
);

/** Everything in the sentence that is not a word, in order. */
export function notWords(text: string): string[] {
  return [...text.matchAll(NOT_A_WORD)].map((m) => m[0]);
}

/** An address is short enough to go to the next line whole. A longer one may still have to be cut. */
const WHOLE = 24;

export function prose(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(NOT_A_WORD)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    const whole = token.length <= WHOLE ? "code-whole" : undefined;
    // An address is a link too, and goes where it says: to the person's own desk for 127.0.0.1, to the site for the rest.
    if (/^https?:\/\//.test(token)) {
      out.push(
        <a key={`${m.index}:${token}`} className="code-link" href={token} target="_blank" rel="noopener noreferrer">
          <code className={whole}>{token}</code>
        </a>,
      );
    } else {
      out.push(
        <code key={`${m.index}:${token}`} className={whole}>
          {token}
        </code>,
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Whether a sentence has anything in it that is not a word. */
export function hasCode(text: string): boolean {
  // Without the flag of the pattern above, which remembers where the last search stopped.
  return new RegExp(NOT_A_WORD.source).test(text);
}
