import SignInForm from "./SignInForm";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in — mozg" };

export default function SignInPage() {
  // Reading this on the server keeps the decision in one place: the button is
  // shown only when the provider is actually configured, so it can never be a
  // button that leads to an error page.
  const githubEnabled = Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);

  return <SignInForm githubEnabled={githubEnabled} />;
}
