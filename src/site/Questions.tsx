import { FAQ, FAQ_GROUP } from "@/content/faq";
import { t } from "@/lib/i18n";

/**
 * The questions, a section of the landing: every question the site has, in
 * three groups, the uncomfortable ones included.
 */
export default function Questions() {
  return (
    <section id="questions" className="section shell" style={{ scrollMarginTop: 76 }}>
      <div className="section-head">
        <span className="eyebrow">{t("Including the uncomfortable ones")}</span>
        <h2 className="h1">{t("Asked before you ask.")}</h2>
      </div>
      {FAQ.map((group, g) => {
        // Numbered straight through the groups, as one list of questions.
        const before = FAQ.slice(0, g).reduce((sum, earlier) => sum + earlier.items.length, 0);
        return (
          <div key={group.group} className="faq-group">
            <p className="eyebrow faq-group-name">{t(FAQ_GROUP[group.group])}</p>
            <div className="faq">
              {group.items.map((item, i) => (
                <details key={item.q}>
                  <summary>
                    <span className="faq-n" aria-hidden="true">
                      {String(before + i + 1).padStart(2, "0")}
                    </span>
                    {t(item.q)}
                  </summary>
                  <p className="faq-a">{t(item.a)}</p>
                </details>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
