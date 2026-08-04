import StarBannerClient from "./StarBannerClient";

const REPO = "egorfedorov/mozg";

/**
 * The star bar. One line above everything: what we are, how many people
 * starred it, and a link that goes straight to the star action.
 *
 * The count is fetched server-side and cached for an hour — GitHub's
 * unauthenticated limit is 60 requests an hour per IP, which one busy
 * minute would burn. A failed fetch renders the bar without a number
 * rather than removing it: the ask matters more than the count.
 */
export default async function StarBanner() {
  let stars: number | null = null;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: { accept: "application/vnd.github+json" },
      next: { revalidate: 3600 },
    });
    if (res.ok) stars = ((await res.json()) as { stargazers_count?: number }).stargazers_count ?? null;
  } catch {
    // No count, still an ask.
  }

  return (
    <>
      <StarBannerClient stars={stars} repo={REPO} />
      {/* Runs before paint, immediately after the bar's markup: a returning
          visitor who dismissed it never sees it, and a first-timer gets no
          layout shift. */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "try{if(localStorage.getItem('star-banner-dismissed')){var e=document.getElementById('star-banner');if(e)e.remove()}}catch(e){}",
        }}
      />
    </>
  );
}
