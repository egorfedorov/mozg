import { liveAnnouncements } from "@/lib/announcements";
import AnnouncementBannerClient from "./AnnouncementBannerClient";

/**
 * The live announcement, above everything else on the page.
 *
 * Server-rendered so it is in the HTML rather than appearing a beat later, and
 * hidden before paint by the same inline-script trick StarBanner uses — a
 * maintenance bar that flashes for people who already dismissed it reads as
 * broken. Keyed by id: dismissing today's notice must not hide tomorrow's.
 */
export default async function AnnouncementBanner() {
  const [live] = await liveAnnouncements();
  if (!live) return null;

  return (
    <>
      <AnnouncementBannerClient announcement={live} />
      <script
        dangerouslySetInnerHTML={{
          __html:
            `try{if(localStorage.getItem('mozg-notice-${live.id}'))` +
            `document.documentElement.classList.add('banner-notice-off')}catch(e){}`,
        }}
      />
    </>
  );
}
