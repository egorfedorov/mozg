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
      <p className="eyebrow">{held ? t("You have this") : t("Also in a pack")}</p>

      {held ? (
        <p style={{ margin: ".4rem 0 .75rem" }}>
          {markup(t("This brain is part of <0/>, which you already hold — nothing more to buy, and the other <1/> brains in it are yours too."), [
          <strong key="s0">{t(pack.title)}</strong>,
          brains - 1,
        ])}</p>
      ) : (
        <p style={{ margin: ".4rem 0 .75rem" }}>
          {markup(
            t(
              "<0/> is this brain and <1/> others the same job needs — bought once at <2/>, shared with <3/> colleagues, and it does not expire.",
            ),
            [
              <strong key="s0">{t(pack.title)}</strong>,
              brains - 1,
              <strong key="s2">{formatCents(pack.priceCents)}</strong>,
              pack.seats - 1,
            ],
          )}
          {singleCents > 0 && (
            <>
              {" "}
              {markup(
                t(
                  "This one alone is <0/>, so the pack pays for itself at <1/> of them.",
                ),
                [
                  formatCents(singleCents),
                  Math.max(2, Math.ceil(pack.priceCents / singleCents)),
                ],
              )}
            </>
          )}
        </p>
      )}

      <Link className={held ? "btn btn-ghost" : "btn"} href={`/packs/${pack.slug}`}>
        {held ? `${t("See what else is in")} ${t(pack.title)}` : `${t("What is in")} ${t(pack.title)}`}
      </Link>
    </section>
  );
}
