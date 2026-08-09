/**
 * Mark a translatable string that lives in data rather than in JSX.
 *
 * Half the words on this site are not in a paragraph: they are the labels of
 * the footer columns, the menu, the cards on the landing page, the five
 * stories. `t()` cannot be called there — it is async, and the array is module
 * scope — and the render site calls `t(card.title)`, which
 * scripts/translate.ts cannot see because it collects string literals, not
 * variables.
 *
 * So the literal is marked where it is written and translated where it is
 * shown:
 *
 *   const CARDS = [{ title: msg("Our components, not Tailwind's") }];
 *   …
 *   <h3>{t(card.title)}</h3>
 *
 * Identity at runtime. It exists to be greppable — which is the whole trick,
 * and the reason it is a function call rather than a comment.
 *
 * Its own file, deliberately: lib/t.ts imports next/headers to read the
 * reader's cookie, so anything importing from there is server-only. The data
 * this marks is exactly the sort that a client component will want one day,
 * and "you cannot import next/headers in a client component" is a confusing
 * way to be told that a label was marked for translation.
 */
export function msg(english: string): string {
  return english;
}

/**
 * The form of a sentence that both halves of the site agree on.
 *
 * A string is written in JSX across three lines and in a data array on one;
 * they are the same sentence and must find the same translation. Both the
 * server's key() and the client's dictionary lookup run their argument through
 * here first, so the layout of the source never decides whether a translation
 * is found.
 *
 * Here rather than in lib/t.ts for that file's own stated reason: this has to
 * be callable from a client component, and lib/t.ts imports next/headers.
 */
export function normalize(english: string): string {
  return english.trim().replace(/\s+/g, " ");
}
