import type { DeskState, Explain, FeedCard } from "@/core/types";
import { breakable } from "@/lib/text";
import CopyButton from "@/components/CopyButton";
import { count, msg, t } from "@/lib/i18n";
import { Brain } from "./Brain";
import { Feed } from "./Feed";
import { DeskNav, type View } from "./Nav";
import { OwnMap, OwnershipHead } from "./OwnMap";

/** The module of the change most worth a minute: the first card that offers one. */
export const nextModuleOf = (state: DeskState): string | null => state.feed.find((card) => card.change)?.module ?? null;

/** What is waiting in a part of the desk, where a number says it better than a mark. */
export function countsOf(state: DeskState): Partial<Record<View, number>> {
  const toExplain = state.modules.filter((m) => m.state === "unexplained" || m.state === "changed").length;
  return toExplain ? { modules: toExplain } : {};
}

/** The verdict of an explain-back, and the mark it is printed with. */
const SIGIL: Record<Explain["verdict"], string> = { explained: "✓", partial: "▲", not_yet: "✕" };
const VERDICT: Record<Explain["verdict"], string> = { explained: msg("Yours"), partial: msg("Almost"), not_yet: msg("Not yet") };

export function ExplainView({ explain }: { explain: Explain }) {
  return (
    <div className="row" data-state={explain.verdict === "explained" ? "explained" : explain.bug?.found ? "bug" : "unexplained"}>
      <span style={{ minWidth: 0 }}>
        <strong>
          {SIGIL[explain.verdict]} {explain.module} · {t(VERDICT[explain.verdict])}
          {explain.bug?.found && ` · ${t("a bug turned up")}`}
        </strong>
        <span className="row-sub">{explain.question}</span>
        <span className="row-sub" style={{ color: "var(--ink)" }}>
          {t("You said:")} {explain.answer}
        </span>
        {explain.lesson && (
          <span className="row-sub" style={{ color: "var(--ink)" }}>
            {t("The lesson:")} {explain.lesson}
          </span>
        )}
        {(explain.why || explain.bug?.note) && (
          <span className="row-meta">
            {explain.why}
            {explain.bug?.note ? ` ${t("Bug:")} ${explain.bug.note}` : ""}
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * The score, what it is made of, and what the brain says about it. The first
 * thing on the desk: everything else says how to move it.
 */
export function ScorePanel({ state, live = true }: { state: DeskState; live?: boolean }) {
  return (
    <div className="score-panel">
      <OwnershipHead state={state} />
      <Brain state={state} live={live} />
    </div>
  );
}

/**
 * The one thing to do next, and the words to say for it. When nothing is
 * waiting, it says that, and nothing else.
 */
export function NextPanel({
  state,
  command,
  commandNote,
  plate = false,
  className = "",
}: {
  state: DeskState;
  command: string;
  commandNote?: string;
  /** On the desk this is the one thing to do, and it takes the page's one yellow plate. */
  plate?: boolean;
  className?: string;
}) {
  const next = nextModuleOf(state);
  return (
    <div className={`next-panel ${className}`.trim()} data-plate={plate || undefined}>
      <span className="eyebrow">{t("Next")}</span>
      {next ? (
        <>
          <p className="next-title">{breakable(next)}</p>
          {commandNote && <p className="next-note">{commandNote}</p>}
          <div className="next-cmd">
            <span className="c" aria-hidden="true">
              {t("say")}
            </span>
            <code>{command}</code>
            <CopyButton text={command} label={t("Copy")} copied={t("Copied. Say it to your agent.")} />
          </div>
        </>
      ) : (
        <p className="next-title next-title-plain">{t("Nothing left to explain.")}</p>
      )}
    </div>
  );
}

/**
 * The cards of a feed under their heading, and the explain-back a card opens,
 * under them where it was opened.
 */
export function FeedPanel({
  cards,
  title,
  open,
  onClose,
  explains,
  renderAction,
  more,
}: {
  cards: FeedCard[];
  title: string;
  /** The id of the explain-back a card has opened, if any. */
  open: string | null;
  onClose: () => void;
  explains: Explain[];
  renderAction: (card: FeedCard) => React.ReactNode;
  /** The way to the whole feed, when these are only the first of it. */
  more?: React.ReactNode;
}) {
  const opened = open ? explains.find((e) => e.id === open) : undefined;
  return (
    <>
      <div className="panel-head">
        <span className="eyebrow">{title}</span>
        <span className="eyebrow">{count(cards.length, "<0/> card", "<0/> cards")}</span>
      </div>
      <Feed cards={cards} renderAction={renderAction} />
      {opened && (
        <div className="explain-open">
          <div className="panel-head">
            <span className="eyebrow">{t("The explain-back")}</span>
            <button type="button" className="linkish" onClick={onClose}>
              {t("Close")}
            </button>
          </div>
          <ExplainView explain={opened} />
        </div>
      )}
      {more}
    </>
  );
}

/**
 * Today, on one sheet: the score and what the brain says, the one thing to do
 * next, then the map and the latest cards. The landing shows it on a sample
 * session, with the desk's five parts standing still beside it; the desk shows
 * the same pieces on a person's own numbers, so the two cannot drift apart.
 */
export function Board({
  state,
  sample = false,
  play = false,
  command,
  commandNote,
}: {
  state: DeskState;
  sample?: boolean;
  /** The sample plays its session once, card by card. */
  play?: boolean;
  /** The next thing to say to the agent. */
  command: string;
  commandNote?: string;
}) {
  return (
    <section className="board showcase" data-play={play ? "true" : undefined} aria-label={t("The mozg board")}>
      <header className="board-bar">
        <span className="term-dot" />
        <span className="term-dot" />
        <span className="term-dot" />
        <span className="board-bar-name">mozg</span>
        <span className="board-bar-side">
          {state.project && <span className="hide-sm">{state.projects.find((p) => p.project === state.project)?.name ?? state.project}</span>}
          <span className="pill">
            {/* Green means "explained". A sample is no such thing, so its mark is plain ink. */}
            {sample ? <span className="dot" aria-hidden="true" /> : <span className="dot" data-state="explained" aria-hidden="true" />}
            {sample ? t("Sample data") : t("Local")}
          </span>
        </span>
      </header>

      <div className="showcase-body">
        <div className="showcase-top">
          <ScorePanel state={state} live={!play} />
          <NextPanel state={state} command={command} commandNote={commandNote} />
        </div>
        <div className="showcase-lower">
          <div className="showcase-map">
            <span className="eyebrow">{t("Your modules")}</span>
            <OwnMap modules={state.modules} limit={8} />
          </div>
          <div className="showcase-latest">
            <span className="eyebrow">{t("Latest cards")}</span>
            <Feed cards={state.feed.slice(0, 3)} play={play} />
          </div>
        </div>
      </div>

      <DeskNav view="today" counts={countsOf(state)} standing />
    </section>
  );
}
