import Link from "next/link";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import { translator } from "@/lib/t";
import { markup } from "@/lib/markup";
import { currentUser } from "@/lib/session";
import { maybeOne } from "@/db";
import { imageGenReady } from "@/lib/imagegen";
import { prices } from "@/lib/genprice";
import { SETS } from "@/lib/slotgen";
import { packsOf } from "@/lib/assetpacks";
import BriefForm from "./BriefForm";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "gen — slot art that arrives game-ready",
  description:
    "Describe the game, get the whole set: eleven symbols on transparency, background, lobby tile. Named for the engine, keyed for a clean cutout, no text baked in.",
};

/**
 * gen.mozg.sh — the studio surface.
 *
 * The argument this page has to make is not "we generate images". Everybody
 * generates images. It is that the output is a *set* a developer can drop into
 * a game: one world across every asset, cut out on transparency, sized per
 * role, named the way the engine expects, and free of the baked-in wording a
 * storefront rejects.
 */
export default async function GenPage() {
  const t = await translator();
  const user = await currentUser();
  const table = await prices();
  const setCosts = Object.fromEntries(
    Object.keys(SETS).map((id) => [id, SETS[id]().reduce((n, s) => n + (table[s.role] ?? 0), 0)]),
  ) as Record<string, number>;

  const [packs, balance] = user
    ? await Promise.all([
        packsOf(user.id, 12),
        maybeOne<{ balance_cents: number }>(`select balance_cents from "user" where id = $1`, [
          user.id,
        ]).then((r) => r?.balance_cents ?? 0),
      ])
    : [[], 0];

  return (
    <>
      <TopBar />

      <main className="shell" style={{ paddingBlock: "clamp(2.5rem, 7vw, 4.5rem)" }}>
        <p className="eyebrow">{t("gen · art for slot games")}</p>
        <h1
          className="display"
          style={{ fontSize: "clamp(2rem, 5.5vw, 3.5rem)", margin: ".5rem 0 1rem", maxWidth: "18ch" }}
        >
          {t("Describe the game. Get the whole set.")}
        </h1>
        <p className="lede" style={{ maxWidth: "60ch" }}>
          {markup(
            t("One brief becomes eleven symbols, a background and a lobby tile — <0>one world across all of them</0>, cut out on transparency, sized per role and named for the engine. Not a folder of pretty pictures somebody still has to turn into a game."),
            [<strong key="s0" />],
          )}
        </p>

        <section style={{ marginTop: "2.5rem", display: "grid", gap: "1.5rem" }}>
          <div>
            <h2>{t("What you get")}</h2>
            <ul className="lede" style={{ maxWidth: "60ch" }}>
              <li>{t("The paytable ladder, not a pile: four lows, three highs, a character, wild, scatter and bonus — each reading as a different object at 128 pixels.")}</li>
              <li>{t("Symbols keyed on flat chroma with nothing touching the frame, so the cutout is clean instead of fringed.")}</li>
              <li>{t("No text, numbers or multipliers painted into the art — that copy has to be a live layer, and a storefront rejects the alternative.")}</li>
              <li>{t("Files named wild.png, scatter.png, low-1.png: what a developer expects, not what a model felt like calling them.")}</li>
            </ul>
          </div>

          {!imageGenReady() ? (
            <p className="muted">{t("Generation is not switched on for this deployment yet.")}</p>
          ) : user ? (
            <BriefForm balanceCents={balance} setCosts={setCosts} />
          ) : (
            <p className="lede">
              {markup(
                t("A full set is <0>13 assets</0>. <1>Sign in</1> to order one."),
                [<strong key="s0" />, <Link key="s1" href="/sign-in?next=/gen" />],
              )}
            </p>
          )}
        </section>

        {packs.length ? (
          <section style={{ marginTop: "3rem" }}>
            <h2>{t("Your packs")}</h2>
            <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: ".5rem" }}>
              {packs.map((p) => (
                <li key={p.id}>
                  <Link href={`/gen/${p.id}`}>{p.title}</Link>{" "}
                  <span className="muted" style={{ fontSize: ".85em" }}>
                    {p.done}/{p.total} · {p.created_at}
                    {p.failed ? ` · ${p.failed} failed` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="muted" style={{ marginTop: "3rem", maxWidth: "60ch" }}>
          {t("Sound comes next: spin, reel stop, the win ladder and a bonus bed, generated the same way and cut to loop. Ask in chat if you want it before it ships.")}
        </p>
      </main>

      <SiteFooter />
    </>
  );
}
