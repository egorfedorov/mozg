import Link from "next/link";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import { formatCents } from "@/lib/money-math";
import { PACKS } from "@/lib/packs";
import { brainsIn, statsOf } from "@/lib/pack-brains";
import { translator } from "@/lib/t";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Packs — mozg",
  description:
    "A trade's brains, sold together and scored separately: the set one job already reaches for, on five seats and one shared allowance.",
};

/**
 * The shelf of packs.
 *
 * Deliberately not a grid of cards with invented badges: each row carries the
 * three numbers that decide whether a pack is worth anything — how many brains,
 * how much material, and what the median exam score is — read live. A pack with
 * a poor median should look poor here.
 */
export default async function PacksPage() {
  const t = await translator();
  const packs = await Promise.all(
    PACKS.map(async (pack) => ({ pack, stats: statsOf(await brainsIn(pack)) })),
  );

  return (
    <>
      <TopBar />
      <Contents active="/packs" />

      <main className="shell" style={{ paddingBlock: "clamp(2.5rem, 7vw, 4.5rem)" }}>
        <p className="eyebrow">Packs</p>
        <h1
          className="display"
          style={{ fontSize: "clamp(2rem, 6.5vw, 4rem)", margin: ".5rem 0 1rem" }}
        >
          {/* One string with the break inside it: a headline handed to a
              translator in two halves comes back as two halves that do not
              agree with each other. */}
          {t("A trade’s brains,\nsold together.")
            .split("\n")
            .map((line, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {line}
              </span>
            ))}
        </h1>
        <p className="lede" style={{ maxWidth: "58ch" }}>
          {t(
            "Nobody needs one brain. A job needs the six or eight its work actually spans — the rules, the API, the maths, the craft — and needs them to agree with each other. A pack is that set, bought once and shared with the people you work with.",
          )}
        </p>
        <p style={{ maxWidth: "58ch", marginTop: "1rem", color: "var(--ink-2)" }}>
          {t(
            "Sold together, scored separately. Every brain in every pack sits its own exam and publishes what it failed, so a pack cannot hide a weak member behind a strong one.",
          )}
        </p>

        <section style={{ marginTop: "clamp(2.5rem, 6vw, 3.5rem)" }}>
          <div className="rows">
            {packs.map(({ pack, stats }) => (
              <Link key={pack.slug} className="row" href={`/packs/${pack.slug}`}>
                <span style={{ minWidth: 0 }}>
                  <strong>{pack.title}</strong>
                  <span className="row-sub">{pack.covers}</span>
                  <span className="row-meta">
                    {stats.brains} {t("brains")} · {stats.notes.toLocaleString("en-US")}{" "}
                    {t("notes")} · {formatCents(pack.priceCents)} {t("once")} · {pack.seats}{" "}
                    {t("seats")}
                  </span>
                </span>
                <span className="row-side">
                  {stats.median !== null ? `${stats.median}% ${t("median")}` : t("unscored")}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <h2 className="h2">{t("Yours is not here")}</h2>
          <p style={{ maxWidth: "58ch", margin: ".5rem 0 1rem" }}>
            {t(
              "Packs get made where the calls already are — the first one exists because a room full of agents kept reaching for the same twelve brains. If that describes your trade, say which brains you would put in it and we will build the ones that are missing.",
            )}
          </p>
          <p style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
            <Link className="btn" href="/chat">
              {t("Ask for a pack")}
            </Link>
            <Link className="btn btn-ghost" href="/explore">
              {t("Browse every brain")}
            </Link>
          </p>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
