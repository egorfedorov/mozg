import Announcements from "@/components/site/Announcements";
import SiteFooter from "@/components/SiteFooter";
import TopBar from "@/components/TopBar";
import { CHANGELOG, ITEM_KIND } from "@/content/changelog";
import { LANG_TAG, t, type Lang } from "@/lib/i18n";

/**
 * What shipped, and what is planned.
 *
 * A vertical line with a mark for each entry: the date on the left, what
 * happened on the right. The entry that is only planned is set apart by its
 * colour and says so, so that a reader can tell a release from an intention
 * without reading a word.
 */
export default function ChangelogPage({ lang }: { lang: Lang }) {
  return (
    <>
      <Announcements lang={lang} close={t("Close")} />
      <TopBar lang={lang} path="/changelog/" />
      <main className="shell page">
        <header className="page-head">
          <h1 className="display page-title">{t("Changelog")}</h1>
          <p className="lede">{t("What shipped in mozg, newest first. What is planned is listed apart, and marked.")}</p>
        </header>

        <ol className="log">
          {CHANGELOG.map((entry, i) => (
            <li key={entry.title} className="log-entry" data-planned={entry.date === null || undefined}>
              <div className="log-when">
                {entry.date ? (
                  <time dateTime={entry.date}>{new Date(`${entry.date}T12:00:00Z`).toLocaleDateString(LANG_TAG[lang], { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</time>
                ) : (
                  t("Not dated")
                )}
              </div>
              <span className="log-dot" aria-hidden="true" />
              <div className="log-body">
                <div className="log-tags">
                  {entry.version && <span className="tag num">{entry.version}</span>}
                  {i === 0 && entry.date && (
                    <span className="tag" data-tint="green">
                      {t("Latest")}
                    </span>
                  )}
                  {entry.date === null && (
                    <span className="tag" data-tint="orange">
                      {t("Planned")}
                    </span>
                  )}
                </div>
                <h2 className="log-title">{t(entry.title)}</h2>
                <p className="log-summary">{t(entry.summary)}</p>
                <ul className="log-items">
                  {entry.items.map((item) => (
                    <li key={item.text} data-kind={item.kind}>
                      <span className="log-kind">{t(ITEM_KIND[item.kind])}</span>
                      <span>{t(item.text)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </main>
      <SiteFooter lang={lang} />
    </>
  );
}
