import type { Metadata } from "next";
import "@/i18n";
import ChangelogPage from "@/site/ChangelogPage";
import { alternatesFor } from "@/site/paths";
import { setLanguage, t, type Lang } from "@/lib/i18n";

export function Changelog({ lang }: { lang: Lang }) {
  setLanguage(lang);
  return <ChangelogPage lang={lang} />;
}

export function changelogMetadata(lang: Lang): Metadata {
  setLanguage(lang);
  const alternates = { canonical: lang === "en" ? "/changelog/" : `/${lang}/changelog/`, languages: alternatesFor("/changelog/") };
  return lang === "en" ? { title: "Changelog", alternates } : { title: `${t("Changelog")} — mozg`, description: t("What shipped in mozg, newest first. What is planned is listed apart, and marked."), alternates };
}
