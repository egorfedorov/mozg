import { t } from "@/lib/i18n";

/**
 * The moment the product is about: an edit stops, and asks.
 *
 * Drawn in this page's own style rather than as a picture of Claude Code. The
 * words are the ones the gate really gives, taken from the same function on
 * the sample session, so the slip cannot drift from what a person will read.
 */
export default function Asks({ file, why, next }: { file: string; why: string; next: string }) {
  return (
    <div className="asks">
      <div
        className="ask-slip"
        role="img"
        aria-label={`${t("An edit waiting for approval.")} ${t("mozg asks before this change.")} ${why} ${next}`}
      >
        <div className="ask-slip-bar" aria-hidden="true">
          <span className="term-dot" />
          <span className="term-dot" />
          <span className="term-dot" />
          <span>{t("the agent, about to edit")}</span>
        </div>
        <p className="ask-file" aria-hidden="true">
          {file}
        </p>
        <p className="ask-reason" aria-hidden="true">
          <strong>{t("mozg asks before this change.")}</strong> {why} {next}
        </p>
        <div className="ask-buttons" aria-hidden="true">
          <span className="ask-btn" data-on="true">
            {t("Approve this one")}
          </span>
          <span className="ask-btn">{t("Refuse")}</span>
        </div>
      </div>

      <div className="asks-text">
        <span className="eyebrow">{t("And then the agent asks")}</span>
        <h3 className="h2">{t("Where it is not yours, the first edit stops.")}</h3>
        <ul className="asks-list">
          <li>
            <i aria-hidden="true" />
            {t("The agent's first edit of a session in that module waits for you, the way Claude Code asks before any edit.")}
          </li>
          <li>
            <i aria-hidden="true" />
            {t("It asks once per module per session. Not twenty times.")}
          </li>
          <li>
            <i aria-hidden="true" />
            {t("Explain the module and it never asks there again, until the agent has rewritten it.")}
          </li>
        </ul>
      </div>
    </div>
  );
}
