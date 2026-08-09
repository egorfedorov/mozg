import { cloneElement, isValidElement, type ReactNode } from "react";

/**
 * A translated sentence that has markup inside it.
 *
 * Most prose on a page is one run of text and `t()` handles it. The rest — the
 * sentences with a link, a <strong> or a number in the middle — cannot be
 * translated by wrapping their pieces: hand a translator "Open the", "catalogue"
 * and "and find the tool you are working with" and three fragments come back
 * that do not agree about case, order or gender, and in half these languages
 * the link has to move to the other end of the clause anyway.
 *
 * So the sentence stays whole and the markup is carried in it as numbered
 * slots, the way every serious i18n library does it:
 *
 *   {markup(t("Open the <0>catalogue</0> and find your tool."), [
 *     <Link href="/explore" />,
 *   ])}
 *
 * `<0>text</0>` wraps the text in slot 0 — the translator translates the inner
 * text too, and may put the whole thing wherever their grammar wants it.
 * `<0/>` drops slot 0 in as it is, which is what a number or a formatted price
 * needs.
 *
 * If a translation goes missing the English sentence arrives here instead and
 * renders identically — the slots are in both, because the key is the English.
 */
export function markup(sentence: string, slots: ReactNode[]): ReactNode[] {
  const out: ReactNode[] = [];
  // Either form of a slot, in one pass: <0>inner</0> or <0/>.
  const re = /<(\d+)>([\s\S]*?)<\/\1>|<(\d+)\/>/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(sentence))) {
    if (m.index > last) out.push(sentence.slice(last, m.index));
    const index = Number(m[1] ?? m[3]);
    const slot = slots[index];
    const inner = m[2];

    if (inner !== undefined && isValidElement(slot)) {
      // Keys here rather than at the call site: the caller writes literal JSX
      // and would have to remember one per slot forever.
      out.push(cloneElement(slot, { key: `s${index}` }, inner));
    } else if (isValidElement(slot)) {
      out.push(cloneElement(slot, { key: `s${index}` }));
    } else {
      // A slot that is not an element — a number, a formatted amount — cannot
      // take children, so any inner text is dropped on purpose rather than
      // rendered twice.
      out.push(<span key={`s${index}`}>{slot}</span>);
    }
    last = m.index + m[0].length;
  }

  if (last < sentence.length) out.push(sentence.slice(last));
  return out;
}

/**
 * The same numbered slots, for the places that need a plain string.
 *
 * `alt`, `aria-label`, `title` and every component prop typed `string` cannot
 * take the nodes markup() returns. Without this the only options were a
 * template literal — which hides the sentence from the translator entirely —
 * or splitting it into `t("of")` and `t("earned")` around the numbers, which
 * is the fragment problem markup() exists to avoid, just spelled differently.
 *
 *   alt={fill(t("A work in <0/>"), [brain.title])}
 *
 * Only `<0/>`-style slots: a `<0>text</0>` run wraps its inner text in an
 * element, and there is no element here to wrap it in.
 */
export function fill(sentence: string, slots: (string | number)[]): string {
  return sentence.replace(/<(\d+)\/>/g, (_, i: string) => {
    const slot = slots[Number(i)];
    return slot === undefined ? "" : String(slot);
  });
}
