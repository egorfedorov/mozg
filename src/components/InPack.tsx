import { translator } from "@/lib/t";
import { markup } from "@/lib/markup";
import Link from "next/link";
import { formatCents } from "@/lib/money-math";
import type { Pack } from "@/lib/packs";

/**
 * "This one also comes in a pack."
 *
 * A brain page that only ever quotes its own price sells the expensive way to
 * the material and hides the cheap one — a reader who needs three of these
 * finds that out after buying two. So the pack is named on every brain inside
 * it, with the arithmetic that makes it the better buy shown rather than
 * asserted.
 *
 * When the reader already holds it, the same strip says so instead: the useful
 * fact then is "you have this", not an offer.
 */
export default async function InPack({
  pack,
  brains,
  held,
  singleCents,
}: {
  pack: Pack;
  /** How many brains the pack contains, read live. */
  brains: number;
  held: boolean;
  /** What this brain alone costs, for the comparison. */
  singleCents: number;
}) {
  const t = await translator();

  return (
    <section
      className="panel"
      style={{ borderLeft: `4px solid var(--color-riso-${held ? "green" : "blue"})` }}
    >
      <p className="eyebrow">{held ? "You have this" : "Also in a pack"}</p>

      {held ? (
        <p style={{ margin: ".4rem 0 .75rem" }}>
          {markup(t("This brain is part of <0/>, which you already hold — nothing more to buy, and the other <1/> brains in it are yours too."), [
          <strong key="s0">{pack.title}</strong>,
          brains - 1,
        ])}</p>
      ) : (
        <p style={{ margin: ".4rem 0 .75rem" }}>
          <strong>{pack.title}</strong> is this brain and {brains - 1} others
          the same job needs — bought once at{" "}
          <strong>{formatCents(pack.priceCents)}</strong>, shared with{" "}
          {pack.seats - 1} colleagues, and it does not expire.
          {singleCents > 0 && (
            <>
              {" "}
              This one alone is {formatCents(singleCents)}, so the pack pays for
              itself at{" "}
              {Math.max(2, Math.ceil(pack.priceCents / singleCents))} of them.
            </>
          )}
        </p>
      )}

      <Link className={held ? "btn btn-ghost" : "btn"} href={`/packs/${pack.slug}`}>
        {held ? `See what else is in ${pack.title}` : `What is in ${pack.title}`}
      </Link>
    </section>
  );
}
