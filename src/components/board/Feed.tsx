import type { CSSProperties } from "react";
import type { FeedCard } from "@/core/types";
import { msg, t } from "@/lib/i18n";

/** What each card is, printed above it. */
const LABEL: Record<FeedCard["state"], string> = {
  unexplained: msg("Not explained"),
  explained: msg("Yours"),
  changed: msg("Changed since"),
  due: msg("Re-check due"),
  bug: msg("Bug found"),
  info: msg("This week"),
};

/**
 * The feed: one card is one verdict and one action.
 *
 * On the landing the actions are labels on a sample. On the desk they work, and
 * the desk decides what "work" means for each card.
 */
export function Feed({
  cards,
  play = false,
  onAction,
  renderAction,
}: {
  cards: FeedCard[];
  /** The sample board plays its session once, card by card. */
  play?: boolean;
  onAction?: (card: FeedCard) => void;
  /** The desk draws its own action for a card: one that copies, or one that opens. */
  renderAction?: (card: FeedCard) => React.ReactNode;
}) {
  return (
    <div className="feed">
      {cards.map((card, i) => (
        <article
          key={card.id}
          className="feed-card"
          data-state={card.state}
          style={play ? ({ "--i": String(i) } as CSSProperties) : undefined}
        >
          <p className="feed-tag">{t(LABEL[card.state])}</p>
          <p className="feed-title">{card.title}</p>
          {card.text && <p className="feed-text">{card.text}</p>}
          {card.action && (
            <div className="feed-actions">
              {renderAction ? (
                renderAction(card)
              ) : onAction ? (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => onAction(card)}>
                  {t(card.action.label)}
                </button>
              ) : (
                <span className="btn btn-sm btn-ghost" aria-disabled="true" title={t("Shown on a sample session")}>
                  {t(card.action.label)}
                </span>
              )}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
