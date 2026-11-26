import type { Metadata } from "next";
import "@/i18n";
import Landing from "@/site/Landing";
import { alternatesFor } from "@/site/paths";
import { setLanguage, t, type Lang } from "@/lib/i18n";

/**
 * The landing, in a language.
 *
 * The language is set at the top of the page, before the first sentence is
 * asked for. It is one value for the process, which is right here: a page is
 * built on its own, and `npm run i18n:check -- --built out` afterwards opens
 * every built page and makes sure it is in its own language.
 */
export function LandingPage({ lang }: { lang: Lang }) {
  setLanguage(lang);
  return <Landing lang={lang} />;
}

export function landingMetadata(lang: Lang): Metadata {
  setLanguage(lang);
  // English takes its title from the root; every other language says its own.
  return lang === "en"
    ? { alternates: { canonical: "/", languages: alternatesFor("/") } }
    : {
        title: t("mozg — own what your AI writes"),
        description: t(
          "mozg reads what your coding agent changed and offers a one-minute explain-back for the parts you cannot yet vouch for. Local only: no keys, no accounts.",
        ),
        alternates: { canonical: `/${lang}/`, languages: alternatesFor("/") },
      };
}
