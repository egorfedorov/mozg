import { t, type Lang } from "@/lib/i18n";
import { INSTALL } from "@/lib/install";
import { sitePath } from "@/site/paths";
import AskLink from "./site/AskLink";
import ChatDock from "./site/ChatDock";
import ClientErrorReporter from "./site/ClientErrorReporter";
import SiteDot from "./site/SiteDot";
import Speak from "./site/Speak";

/**
 * The end of every page: what this is, where to read more, the fine print, and
 * the way to the person behind it.
 *
 * It also carries what every page shares and only the browser can do: the chat,
 * the page's language for what is said after a click, and the reporting of a
 * page that throws. (The operator's announcements open each page from above.)
 * None of it is on the plugin's
 * desk, which has no footer: from a person's machine nothing comes here.
 */
export default function SiteFooter({ lang }: { lang: Lang }) {
  const home = sitePath(lang, "/");
  const columns: { title: string; links: { key: string; node: React.ReactNode }[] }[] = [
    {
      title: t("The product"),
      links: [
        { key: "desk", node: <a href={`${home}#desk`}>{t("The sample desk")}</a> },
        { key: "how", node: <a href={`${home}#how`}>{t("How it works")}</a> },
        { key: "pricing", node: <a href={`${home}#pricing`}>{t("Pricing")}</a> },
        { key: "install", node: <a href={`${home}#install`}>{t("Install")}</a> },
        { key: "docs", node: <a href={sitePath(lang, "/docs/")}>{t("Docs")}</a> },
      ],
    },
    {
      title: t("Keep in touch"),
      links: [
        { key: "ask", node: <AskLink label={t("Write to the author")} /> },
        { key: "changelog", node: <a href={sitePath(lang, "/changelog/")}>{t("Changelog")}</a> },
        { key: "site", node: <a href={INSTALL.site}>{t("mozg.sh")}</a> },
      ],
    },
    {
      title: t("The fine print"),
      links: [
        { key: "questions", node: <a href={`${home}#questions`}>{t("Questions people ask")}</a> },
        { key: "privacy", node: <a href={sitePath(lang, "/docs/privacy/")}>{t("Privacy and data")}</a> },
        {
          key: "source",
          node: (
            <a href="https://github.com/egorfedorov/mozg" target="_blank" rel="noopener noreferrer">
              {t("Source and licence")}
            </a>
          ),
        },
      ],
    },
  ];

  return (
    <footer className="footer">
      <div className="shell footer-grid">
        <div>
          <a href={home} className="wordmark">
            mozg<span aria-hidden="true">.</span>
          </a>
          <p className="footer-tag">{t("Own what your AI writes.")}</p>
        </div>
        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <p className="eyebrow" style={{ margin: "0 0 .6rem" }}>
              {column.title}
            </p>
            <ul className="footer-col">
              {column.links.map((link) => (
                <li key={link.key}>{link.node}</li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="shell footer-legal">
        <span className="footer-state">
          <SiteDot up={t("The site's services are up.")} down={t("The site's services are not answering.")} />
          {t("The plugin is local only: no keys, no accounts, and none of your code leaves your machine.")}
        </span>
        <span style={{ flex: 1 }} />
        <span>© {new Date().getFullYear()} mozg</span>
      </div>

      <Speak lang={lang} />
      <ChatDock lang={lang} openLabel={t("Open the chat")} closeLabel={t("Close")} />
      <ClientErrorReporter />
    </footer>
  );
}
