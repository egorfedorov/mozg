import { landingMetadata, LandingPage } from "@/site/pages/LandingPage";

export const metadata = landingMetadata("en");

export default function Page() {
  return <LandingPage lang="en" />;
}
