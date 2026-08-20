import Link from "next/link";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import { translator } from "@/lib/t";
import { markup } from "@/lib/markup";
import { msg } from "@/lib/msg";
import { currentUser } from "@/lib/session";
import { maybeOne } from "@/db";
import { imageGenReady } from "@/lib/imagegen";
import { prices } from "@/lib/genprice";
import { SETS } from "@/lib/slotgen";
import { packsOf } from "@/lib/assetpacks";
import BriefForm from "./BriefForm";
import Showcase from "./Showcase";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "gen — slot art that arrives game-ready",
  description:
    "Describe the game, get the whole set: eleven symbols on transparency, a background and a lobby tile, drawn as one world, cut out, and packed into a sheet your engine loads in one call.",
};

/**
 * gen.mozg.sh — the storefront.
 *
 * The argument is not "we generate images". Everyone generates images, and a
 * page leading with that competes on adjectives. The argument is that a *set*
 * comes back — one world across eleven symbols, cut out, named and packed for
 * an engine — so the page shows the set first and only then explains how it
 * was made, in the order somebody sceptical would ask.
 */

const GETS: { tint: string; title: string; body: string }[] = [
  {
    tint: "yellow",
    title: msg("A paytable, not a pile"),
    body: msg(
      "Four lows, two mids, a premium, a character, and the three marks: wild, scatter, bonus. Material rises with the tier, so a player reads value off the reel before they open the paytable.",
    ),
  },
  {
    tint: "green",
    title: msg("Cut out, including under the alpha"),
    body: msg(
      "Symbols arrive on transparency with the key removed from the hidden channels too. Skip that and the first mipmap drags it back out as a coloured rim — in-engine, after everything shipped.",
    ),
  },
  {
    tint: "red",
    title: msg("Nothing written into the art"),
    body: msg(
      "No WILD carved across the symbol. That word is a live text layer the game owns and localises; painted-in copy is what a storefront rejects and what a translator cannot touch.",
    ),
  },
  {
    tint: "blue",
    title: msg("An export, not a folder"),
    body: msg(
      "A sprite sheet and a manifest your frontend loads in one call, every original untouched, and the prompt behind each asset — so the set can be extended next month without guessing at the wording.",
    ),
  },
];

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

      <main className="shell" style={{ paddingBlock: "clamp(3rem, 9vw, 5.5rem)" }}>
        <p className="eyebrow">{t("AI asset studio · for slot and iGaming teams")}</p>
        <h1
          className="display"
          style={{ fontSize: "clamp(2.1rem, 6vw, 3.8rem)", margin: ".5rem 0 1rem", maxWidth: "16ch" }}
        >
          {t("Describe the game. Get the whole set.")}
        </h1>
        <p className="lede" style={{ maxWidth: "62ch" }}>
          {markup(
            t("One brief becomes eleven symbols, a background and a lobby tile — <0>one world across all of them</0>, cut out on transparency, sized per role, named for the engine and packed into a sheet your frontend loads in one call."),
            [<strong key="s0" />],
          )}
        </p>

        <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", margin: "1.5rem 0 .5rem", alignItems: "center" }}>
          <Link className="btn" href={user ? "#order" : "/sign-in?next=/gen"}>
            {t("Order a set")}
          </Link>
          <Link className="btn btn-ghost" href="/gen/panel">
            {t("Your studio")}
          </Link>
          <span className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-3)" }}>
            {t("a full game")} ${(setCosts.full / 100).toFixed(2)} · {t("no subscription")}
          </span>
        </div>

        {/* The claim is not one anybody should take in prose. */}
        <Showcase />

        <section style={{ marginTop: "clamp(3.5rem, 9vw, 5.5rem)" }}>
          <p className="eyebrow">{t("What nobody else does")}</p>
          <h2 className="h1" style={{ margin: ".6rem 0 1.25rem", maxWidth: "20ch" }}>
            {t("Eleven symbols, or eleven readings of one sentence")}
          </h2>
          <p className="lede" style={{ maxWidth: "62ch" }}>
            {t("A model has no memory between calls. Ask it eleven times from the same brief and you get eleven interpretations of it: the light flips, the outline drifts, the gold in one symbol is the gold of a different game. That is why generated sets look generated.")}
          </p>
          <p className="lede" style={{ maxWidth: "62ch", marginTop: "1rem" }}>
            {markup(
              t("So one asset is drawn first — the premium symbol, the one carrying the most material and light — and <0>every other asset is drawn against that picture</0>, and against the siblings already finished, under one instruction: same world, same light, same outline weight, a different object every time."),
              [<strong key="s0" />],
            )}
          </p>
        </section>

        <section style={{ marginTop: "clamp(3rem, 8vw, 4.5rem)" }}>
          <p className="eyebrow">{t("What lands in your repo")}</p>
          <h2 className="h1" style={{ margin: ".6rem 0 1.25rem" }}>
            {t("One zip, already game-ready")}
          </h2>

          <div className="term" aria-label={t("What the export contains")}>
            <div className="term-bar">
              <span className="term-dot" />
              <span className="term-dot" />
              <span className="term-dot" />
            </div>
            <div className="u">unzip tomb-of-the-scarab-king.zip</div>
            <div className="t">
              symbols.png <span className="c">{t("— the sheet, 11 frames, trimmed")}</span>
            </div>
            <div className="t">
              symbols.json <span className="c">{t("— manifest PixiJS loads natively")}</span>
            </div>
            <div className="t">trimmed/wild.png · scatter.png · low-1.png …</div>
            <div className="t">
              originals/ <span className="c">{t("— every asset exactly as generated")}</span>
            </div>
            <div className="t">
              PROMPTS.md <span className="c">{t("— what each asset was asked for")}</span>
            </div>
          </div>

          <p className="lede" style={{ maxWidth: "62ch", marginTop: "1.25rem" }}>
            {t("The trim is recorded rather than discarded: a sprite whose transparent margin is silently cropped lands in the wrong place on the reel. Frames keep your own labels, because those are what your code already says.")}
          </p>
        </section>

        <section style={{ marginTop: "clamp(3rem, 8vw, 4.5rem)" }}>
          <p className="eyebrow">{t("What you get")}</p>
          <div
            style={{
              display: "grid",
              gap: "1rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              marginTop: "1.25rem",
            }}
          >
            {GETS.map((g) => (
              <div className="card" data-tint={g.tint} key={g.title}>
                <h3 className="h3" style={{ margin: "0 0 .5rem" }}>{t(g.title)}</h3>
                <p style={{ margin: 0, color: "var(--ink-2)" }}>{t(g.body)}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="order" style={{ marginTop: "clamp(3.5rem, 9vw, 5rem)" }}>
          <p className="eyebrow">{t("Order")}</p>
          <h2 className="h1" style={{ margin: ".6rem 0 1.25rem" }}>
            {t("Priced per asset, paid from your balance")}
          </h2>

          {/* The front door leads to the cabinet now, not to a brief box.
              Ordering a set blind was the whole complaint: there was nowhere to
              see the thirteen assets before paying for them, and nowhere your
              last game lived. The form below still works and is still the
              fastest path for somebody who knows exactly what they want — it is
              simply no longer the only one. */}
          {imageGenReady() && user && (
            <div
              className="panel"
              style={{
                marginBottom: "1.5rem",
                borderLeft: "4px solid var(--color-riso-green)",
              }}
            >
              <p className="eyebrow" style={{ margin: 0 }}>{t("The way most studios want it")}</p>
              <p style={{ color: "var(--ink-2)", margin: ".4rem 0 1rem", maxWidth: "62ch" }}>
                {t("Start a project instead: name the game, describe its world, and see the whole set as a list before anything is bought. Rewrite the symbols you care about, drop the ones you do not want, and generate when the price looks right.")}
              </p>
              <Link className="btn" href="/gen/panel">{t("Open your games")}</Link>
            </div>
          )}

          {!imageGenReady() ? (
            <p className="muted">{t("Generation is not switched on for this deployment yet.")}</p>
          ) : user ? (
            <BriefForm balanceCents={balance} setCosts={setCosts} />
          ) : (
            <p className="lede" style={{ maxWidth: "62ch" }}>
              {markup(
                t("A full game is thirteen assets. <0>Sign in</0> to order one — nothing monthly, nothing to cancel."),
                [<Link key="s0" href="/sign-in?next=/gen" />],
              )}
            </p>
          )}
        </section>

        {packs.length ? (
          <section style={{ marginTop: "3rem" }}>
            <p className="eyebrow">{t("Your packs")}</p>
            <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: ".5rem", marginTop: ".75rem" }}>
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

        <section style={{ marginTop: "clamp(3rem, 8vw, 4.5rem)" }}>
          <p className="eyebrow">{t("What it does not do yet")}</p>
          <ul className="lede" style={{ maxWidth: "62ch", marginTop: ".75rem" }}>
            <li>{t("Sound. The pipeline is written and the machine that runs it is switched off — it comes back when somebody is paying for volume, not before.")}</li>
            <li>{t("Rigs. Assets come out flat: no layer separation and no skeleton, so animation is still your artist's job.")}</li>
            <li>{t("One world per pack. A second theme is a second brief, because the whole design is that a set matches itself.")}</li>
          </ul>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
