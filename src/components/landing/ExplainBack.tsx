import type { Explain } from "@/core/types";
import { msg, t } from "@/lib/i18n";

const VERDICT: Record<Explain["verdict"], string> = { explained: msg("Explained"), partial: msg("Almost"), not_yet: msg("Not yet") };

/**
 * One explain-back, as it happens.
 *
 * The landing can describe the minute in three panels, or it can show one. The
 * voices are the product's three parties, in the order they speak: the agent
 * that asks, the person who answers in their own words, and the examiner that
 * grades without having written any of it.
 */
export default function ExplainBack({ explain }: { explain: Explain }) {
  return (
    <div className="xb">
      <div className="xb-row" data-who="agent">
        <span className="xb-who">{t("The agent asks")}</span>
        <p className="xb-text">{explain.question}</p>
      </div>
      <div className="xb-row" data-who="you">
        <span className="xb-who">{t("You answer")}</span>
        <p className="xb-text">{explain.answer}</p>
      </div>
      <div className="xb-row" data-who="examiner">
        <span className="xb-who">{t("The examiner grades")}</span>
        <p className="xb-text">
          <strong className="xb-verdict">{t(VERDICT[explain.verdict])}</strong>
          {explain.why}
          {explain.bug?.found && (
            <>
              {" "}
              <span className="xb-bug">
                {/* The red is a mark, not a word: no riso ink reaches 4.5:1 on paper at text size. */}
                <i className="xb-bug-mark" aria-hidden="true" />
                {t("A bug turned up:")}
              </span>{" "}
              {explain.bug.note}
            </>
          )}
        </p>
      </div>
    </div>
  );
}
