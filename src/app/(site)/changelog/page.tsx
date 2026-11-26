import { changelogMetadata, Changelog } from "@/site/pages/ChangelogPage";

export const metadata = changelogMetadata("en");

export default function Page() {
  return <Changelog lang="en" />;
}
