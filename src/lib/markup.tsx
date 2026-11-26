import { cloneElement, isValidElement, type ReactNode } from "react";

// `fill` and `msg` live in ./i18n: they are plain strings, and the server
// builds sentences from them without any UI framework in the bundle.
export { fill, msg } from "./i18n";

/**
 * A sentence that has markup inside it, kept whole.
 *
 * Hand a translator "Open the", "catalogue" and "and find your tool" and three
 * fragments come back that do not agree about case, order or gender. So the
 * sentence stays one string and the markup rides in it as numbered slots:
 *
 *   {markup("Open the <0>catalogue</0> and find your tool.", [
 *     <Link href="/desk" />,
 *   ])}
 *
 * `<0>text</0>` wraps the text in slot 0; `<0/>` drops slot 0 in as it is,
 * which is what a number needs. A translation that goes missing renders the
 * English identically, because the slots are in both.
 */
export function markup(sentence: string, slots: ReactNode[]): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /<(\d+)>([\s\S]*?)<\/\1>|<(\d+)\/>/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(sentence))) {
    if (m.index > last) out.push(sentence.slice(last, m.index));
    const index = Number(m[1] ?? m[3]);
    const slot = slots[index];
    const inner = m[2];

    if (inner !== undefined && isValidElement(slot)) {
      out.push(cloneElement(slot, { key: `s${index}` }, inner));
    } else if (isValidElement(slot)) {
      out.push(cloneElement(slot, { key: `s${index}` }));
    } else {
      out.push(<span key={`s${index}`}>{slot}</span>);
    }
    last = m.index + m[0].length;
  }

  if (last < sentence.length) out.push(sentence.slice(last));
  return out;
}
