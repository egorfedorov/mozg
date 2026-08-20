import Link from "next/link";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import { translator } from "@/lib/t";
import { markup, fill } from "@/lib/markup";
import { msg } from "@/lib/msg";
import { currentUser } from "@/lib/session";
import { imageGenReady } from "@/lib/imagegen";
import { prices } from "@/lib/genprice";
import { SETS } from "@/lib/slotgen";
import { formatCents } from "@/lib/money-math";
import Showcase from "./Showcase";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "gen — slot art, planned before it is paid for",
  description:
    "Name the game, see the whole set as a list, rewrite the symbols you care about, and generate when the price looks right. Eleven symbols on transparency, a background and a lobby tile, drawn as one world.",
};

/**
 * gen.mozg.sh — the front door.
 *
 * The page it replaces led with a brief box and a button that spent money.
 * That is the wrong first impression of this product twice over: it competes on
 * "we generate images", which everybody does, and it asks for a decision before
 * showing what the decision buys.
 *
 * What is actually different here is the order of events — the set exists as a
 * plan you can read and edit before a penny moves. So the page is the flow, in
 * the order it happens, and the proof comes after it rather than instead.
 */

const STEPS: { n: string; title: string; body: string; free: boolean }[] = [
  {
    n: "1",
    title: msg("Name the game and describe its world"),
    body: msg(
      "A sentence or two: the place, the light, the materials, painted or rendered. This is the shared half of every prompt — it is what makes eleven symbols look like one game instead of eleven.",
    ),
    free: true,
  },
  {
    n: "2",
    title: msg("See the whole set as a list"),
    body: msg(
      "Four lows, two mids, a premium, a character, wild, scatter, bonus, plus background, reel frame and lobby tile. Every one already carries what it is for — you are editing a plan, not staring at an empty box.",
    ),
    free: true,
  },
  {
    n: "3",
    title: msg("Rewrite only what you care about"),
    body: msg(
      "Describe the premium yourself and leave the rest to the world you wrote. An empty description is the right answer for most symbols — the world is already the instruction.",
    ),
    free: true,
  },
  {
    n: "4",
    title: msg("Generate when the price looks right"),
    body: msg(
      "The set is priced before the button, against your balance. Assets land one by one, cut out and named. A failed asset refunds itself.",
    ),
    free: false,
  },
];

const GETS: { tint: string; title: string; body: string }[] = [
  {
    tint: "yellow",
    title: msg("A paytable, not a pile"),
    body: msg(
      "Material rises with the tier, so a player reads value off the reel before they open the paytable. Ask a model for a humble trinket and it returns a jewelled amulet — the ladder here exists so the cheap symbol actually looks cheap.",
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
    title: msg("One world, held across the set"),
    body: msg(
      "One asset is drawn first and every other is drawn against its picture. Eleven independent calls give you one game and four silhouettes; a reference is the only thing that actually fixes it.",
    ),
  },
];

export default async function GenPage() {
  const t = await translator();
  const user = await currentUser();

  const table = await prices();
  const fullSet = SETS.full();
  const fullCost = fullSet.reduce((n, s) => n + (table[s.role] ?? 0), 0);
  const rigSet = SETS["rig-ready"]();
  const rigCost = rigSet.reduce((n, s) => n + (table[s.role] ?? 0), 0);
  const symbolPrice = table.symbol ?? 0;

  const start = user ? "/gen/panel" : "/sign-in?next=/gen/panel";

  return (
    <>
      <TopBar />

      <main className="shell" style={{ paddingBlock: "clamp(2.5rem, 7vw, 4.5rem)" }}>
        {/* ── hero ─────────────────────────────────────────────────────── */}
        <p className="eyebrow">{t("gen · asset studio for slot teams")}</p>
        <h1
          className="display"
          style={{ fontSize: "clamp(2.2rem, 6vw, 4rem)", margin: ".6rem 0 1rem", maxWidth: "18ch" }}
        >
          {markup(t("Plan the set. <0/> Then pay for it."), [<br key="s0" />])}
        </h1>
        <p className="lede" style={{ fontSize: "clamp(1rem, 2vw, 1.15rem)", maxWidth: "56ch" }}>
          {markup(t("Name the game, and the whole set appears as a list you can read and rewrite — eleven symbols, a background, a reel frame, a lobby tile. Nothing is charged until you say generate. A full game is <0/>, or <1/> an asset."), [
            formatCents(fullCost),
            formatCents(symbolPrice),
          ])}
        </p>

        <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", alignItems: "center", marginTop: "1.75rem" }}>
          <Link className="btn" href={start}>
            {user ? t("Open your games") : t("Start a game")}
          </Link>
          <a className="btn btn-ghost" href="#how">
            {t("See how it works")}
          </a>
          <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>
            {t("planning is free · no subscription · paid from your mozg balance")}
          </span>
        </div>

        {!imageGenReady() && (
          <p className="muted" style={{ marginTop: "1rem" }}>
            {t("Generation is not switched on for this deployment yet.")}
          </p>
        )}

        {/* ── the flow, which is the whole argument ────────────────────── */}
        <section id="how" style={{ marginTop: "clamp(3.5rem, 9vw, 5.5rem)" }}>
          <div className="section-head">
            <h2 className="h2">{t("Four steps, and three of them are free")}</h2>
            <span className="eyebrow">{t("the money is one button, at the end")}</span>
          </div>

          <div
            style={{
              display: "grid",
              gap: "1px",
              background: "var(--rule)",
              border: "1.5px solid var(--ink)",
              gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
            }}
          >
            {STEPS.map((s) => (
              <div key={s.n} style={{ background: "var(--paper-2)", padding: "1.25rem" }}>
                <span
                  className="display"
                  style={{
                    fontSize: "2rem",
                    display: "block",
                    color: s.free ? "var(--color-riso-green)" : "var(--color-riso-red)",
                  }}
                >
                  {s.n}
                </span>
                <h3 className="h3" style={{ margin: ".5rem 0 .5rem" }}>
                  {t(s.title)}
                </h3>
                <p style={{ color: "var(--ink-2)", margin: 0, fontSize: ".9375rem" }}>{t(s.body)}</p>
                <p className="mono" style={{ fontSize: ".6875rem", margin: ".75rem 0 0", color: s.free ? "var(--color-riso-green)" : "var(--ink-3)" }}>
                  {s.free ? t("free") : t("this is the one that costs")}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── proof ────────────────────────────────────────────────────── */}
        <Showcase />

        {/* ── what makes a set a set ───────────────────────────────────── */}
        <section style={{ marginTop: "clamp(3.5rem, 9vw, 5.5rem)" }}>
          <p className="eyebrow">{t("Why a set and not eleven pictures")}</p>
          <h2 className="h1" style={{ margin: ".6rem 0 1.5rem", maxWidth: "22ch" }}>
            {t("Any model draws a symbol. Twelve that match is the job.")}
          </h2>
          <div
            style={{
              display: "grid",
              gap: "1px",
              background: "var(--rule)",
              border: "1.5px solid var(--ink)",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            }}
          >
            {GETS.map((g) => (
              <div key={g.title} style={{ background: "var(--paper-2)", padding: "1.25rem" }}>
                <p className="eyebrow" style={{ margin: 0, color: `var(--color-riso-${g.tint})` }}>
                  {"//"}
                </p>
                <h3 className="h3" style={{ margin: ".4rem 0 .5rem" }}>
                  {t(g.title)}
                </h3>
                <p style={{ color: "var(--ink-2)", margin: 0, fontSize: ".9375rem" }}>{t(g.body)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── what a game costs, and what a pack buys ──────────────────── */}
        <section style={{ marginTop: "clamp(3.5rem, 9vw, 5.5rem)" }}>
          <div className="section-head">
            <h2 className="h2">{t("What it costs")}</h2>
            <span className="eyebrow">{t("per asset · nothing monthly")}</span>
          </div>

          <div
            style={{
              display: "grid",
              gap: "1px",
              background: "var(--rule)",
              border: "1.5px solid var(--ink)",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              maxWidth: "52rem",
            }}
          >
            {[
              {
                title: t("A full game"),
                cost: fullCost,
                n: fullSet.length,
                note: t("11 symbols, a background and a lobby tile, drawn as one world"),
                loud: false,
              },
              {
                title: t("A full game, rig-ready"),
                cost: rigCost,
                n: rigSet.length,
                note: t("the same plus a reel frame and the win and blink faces — the set mozg-spine animates without redrawing anything"),
                loud: true,
              },
            ].map((o) => (
              <div
                key={o.title}
                style={{
                  background: o.loud ? "var(--color-riso-yellow)" : "var(--paper-2)",
                  padding: "1.25rem",
                }}
              >
                <p className="eyebrow" style={{ margin: 0 }}>{o.title}</p>
                <p className="display" style={{ fontSize: "clamp(1.8rem, 5vw, 2.6rem)", margin: ".3rem 0 .5rem" }}>
                  {formatCents(o.cost)}
                </p>
                <p className="mono" style={{ fontSize: ".6875rem", color: o.loud ? "var(--ink)" : "var(--ink-3)", margin: "0 0 .6rem" }}>
                  {fill(t("<0/> assets · <1/> each"), [o.n, formatCents(symbolPrice)])}
                </p>
                <p style={{ color: "var(--ink-2)", margin: 0, fontSize: ".9375rem" }}>{o.note}</p>
              </div>
            ))}
          </div>

          {/* "Where do I buy packs" — you already can, and it is the balance a
              brain is bought with. What was missing was anyone saying what a
              given top-up actually buys, which is the only form of that
              question anybody is really asking. */}
          <div style={{ marginTop: "1.5rem", maxWidth: "52rem" }}>
            <p className="eyebrow">{t("Packs — top up once, spend it as you go")}</p>
            <div className="rows" style={{ marginTop: ".6rem" }}>
              {/* Sized to the new prices: a pack that buys less than one game is
                a pack nobody can act on. */}
            {[2500, 7500, 20000, 50000].map((cents) => (
                <div className="row" key={cents}>
                  <span style={{ minWidth: 0 }}>
                    <strong className="mono">{formatCents(cents)}</strong>
                    <span className="row-sub">
                      {fill(t("<0/> assets — about <1/> rig-ready games"), [
                        Math.floor(cents / symbolPrice),
                        Math.floor(cents / rigCost),
                      ])}
                    </span>
                  </span>
                  <span className="row-side mono" style={{ fontSize: ".75rem" }}>
                    {fill(t("<0/> full games"), [Math.floor(cents / fullCost)])}
                  </span>
                </div>
              ))}
            </div>
            <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", marginTop: ".75rem" }}>
              {t("It is the same mozg balance a brain is bought with — one wallet, no credits to convert, nothing expires and nothing renews. A failed asset refunds itself.")}
            </p>
            <div style={{ display: "flex", gap: ".6rem", marginTop: "1rem", flexWrap: "wrap" }}>
              <Link className="btn" href={start}>
                {user ? t("Open your games") : t("Start a game")}
              </Link>
              <a className="btn btn-ghost" href="https://mozg.sh/settings/topup">
                {t("Top up the balance")}
              </a>
            </div>
          </div>
        </section>

        {/* ── the half nobody else has finished ────────────────────────── */}
        <section style={{ marginTop: "clamp(3.5rem, 9vw, 5.5rem)" }}>
          <div className="section-head">
            <h2 className="h2">{t("Then rig it, on your own machine")}</h2>
            <span className="eyebrow">{t("optional · your Spine licence, or none")}</span>
          </div>
          <p className="lede">
            {markup(t("Assets come out flat — layers and skeletons are not generated. What is generated is art built to be cut up, and <0>mozg-spine</0> turns it into a rigged, animated Spine skeleton with idle, win and blink: json, atlas and an editable project. Rigging needs no Spine licence at all; a licence adds the packer and the editable file."), [
              <a key="s0" href="https://mozg.sh/b/mozg/spine-2d-animation" style={{ textDecoration: "underline" }} />,
            ])}
          </p>
          <p className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>
            {t("/plugin install mozg-spine@mozg")}
          </p>
        </section>

        {/* ── the honest part ──────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(3rem, 7vw, 4rem)" }}>
          <p className="eyebrow">{t("What it does not do")}</p>
          <ul style={{ color: "var(--ink-2)", maxWidth: "62ch", lineHeight: 1.7, paddingLeft: "1.1rem" }}>
            <li>
              {t("One world per project. A second theme is a second project, because the whole design is that a set matches itself.")}
            </li>
            <li>
              {t("No layer separation. Assets arrive as one cut-out image, not as base, frame, glow and FX on separate layers.")}
            </li>
            <li>
              {t("It will not read your mind about a symbol you did not describe — it will draw it from the world you did, which is usually what you wanted and occasionally not.")}
            </li>
          </ul>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
