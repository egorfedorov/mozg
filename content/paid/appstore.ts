export const NOTES: {
  title: string;
  body: string;
  category: string;
  kind: "fact" | "rule" | "layout" | "example" | "pitfall";
}[] = [
  // ── Apple guidelines that bite ──────────────────────────────────────────────

  {
    title: "What do Apple reviewers actually do with my build?",
    body: "App Review installs your binary on a real device (an iPhone on current iOS, plus iPad if you declare iPad support), launches it, and taps through the primary flows for roughly 5–15 minutes. They check for crashes, dead buttons, placeholder text, lorem ipsum, empty states, and broken links — all citable under 2.1 App Completeness. They do not explore every corner of your app, but they always test the exact flow you describe in the review notes. If a feature requires hardware, a specific location, or a backend that is down, they hit it. Submit with review notes that walk the reviewer through the core flow step by step; unexplained complexity is how good apps get bounced under 2.1.",
    category: "Apple guidelines that bite",
    kind: "fact",
  },
  {
    title: "Rejected under 2.1 App Completeness — what does it cover?",
    body: "2.1 is the catch-all for 'the app did not work as described during review': crashes on launch, broken demo login, missing metadata (no demo account when login is required, no review notes for non-obvious flows), placeholder content, or misleading functionality. The most common concrete trigger is a login wall with no demo account in App Review Information — Apple will not create an account for you. Fix: supply a working demo account (username + password, kept alive for the whole review period), set up any required subscription/IAP sandbox data, and write review notes that tell the reviewer exactly where to tap. If your backend is region-locked or needs VPN, say so in notes.",
    category: "Apple guidelines that bite",
    kind: "rule",
  },
  {
    title: "Do I need Sign in with Apple?",
    body: "Yes, if you offer any third-party or social login (Google, Facebook, X, etc.) as the way to create or access an account in your app — guideline 4.8 requires Sign in with Apple as an equivalent option. Exceptions: apps that only use their own first-party account system, apps that are login companions to an enterprise service, and apps where the account is a government-issued citizen ID. Practical details reviewers check: the Sign in with Apple button must be at least as prominent as the others, must work without forcing the user to then link an email/password afterwards, and must support the private relay email. Offering only Google login with no Apple option is an automatic rejection as of early 2026.",
    category: "Apple guidelines that bite",
    kind: "rule",
  },
  {
    title: "Rejected under 4.2 Minimum Functionality — what now?",
    body: "4.2 is aimed at apps that are a website in a WKWebView shell, a single static screen, or a feature the user could get from a bookmark. Reviewers apply it when the app adds nothing over Safari: no offline behavior, no native features, no meaningful app-specific UI. To pass, the app needs durable value that survives scrutiny: native push notifications, offline mode, Home Screen widgets, Shortcuts integration, camera/HealthKit use, or an experience clearly designed for the app rather than the browser. If you are wrapping a website, the reliable path is adding genuinely native functionality — arguing in appeal that 'our web app is really good' almost never overturns 4.2.",
    category: "Apple guidelines that bite",
    kind: "pitfall",
  },
  {
    title: "Rejected under 4.3 Spam — what now?",
    body: "4.3 flags duplicates: apps that share substantially the same code, content, or feature set as other apps on the store — including your own reskins, white-label template apps submitted to one developer account, and apps that copy another developer's concept and assets. Template/white-label products must be submitted under the end customer's own developer account (Apple formalized this in the 4.2.6/4.3 template-app crackdown); a single account hosting dozens of client clones gets terminated, not just rejected. If you believe the flag is wrong, appeal with specifics: name the features that differentiate your app and the original IP you own. 'Our app is different' with no evidence fails; a feature-by-feature comparison sometimes succeeds.",
    category: "Apple guidelines that bite",
    kind: "pitfall",
  },
  {
    title: "What is guideline 2.3.1 about hidden features?",
    body: "2.3.1 prohibits hidden, dormant, or undocumented functionality: features unlocked after approval by a server flag, secret gestures, Easter eggs that change core behavior, or functionality that differs from what the reviewer saw. This is one of the few violations that escalates straight to account termination because it is treated as deliberately misleading review. The classic trap is shipping a build with a remote-config 'kill switch' that turns on gambling, crypto trading, or a different store after approval. It is fine to gate features behind your own server-side rollout for legitimate A/B testing of equivalent functionality; it is not fine when the post-review app is materially different from the reviewed app.",
    category: "Apple guidelines that bite",
    kind: "rule",
  },

  // ── Payments and IAP ────────────────────────────────────────────────────────

  {
    title: "When must I use In-App Purchase (3.1.1)?",
    body: "Guideline 3.1.1 requires IAP for anything digital consumed inside the app: premium features, subscriptions, virtual currency, boosts, game items, ad removal, digital content unlocks. You may not use Stripe/PayPal/web checkout for these, and you may not even link or refer users to an external purchase method from inside the app except under the specific external-link rules below. Physical goods and services consumed outside the app (ride-hailing, food delivery, physical retail, real-person services like tutoring) must NOT use IAP — Apple rejects IAP for those. Multiplatform services can offer an account created elsewhere to log in, but the app must not steer iOS users to that external purchase path in a way that violates the steering rules.",
    category: "Payments and IAP",
    kind: "rule",
  },
  {
    title: "Can I link out to my website for payment?",
    body: "As of early 2026 the rules differ sharply by storefront. US: after the court ruling in Epic v. Apple enforcement, Apple permits US-storefront apps to include buttons/links to external purchase without the anti-steering rejection and without Apple commission — many apps now ship a plain external checkout link in the US. EU: the StoreKit External Purchase Link Entitlement (EU) and DMA alternative terms allow external links with disclosure sheets and a reduced commission structure. Elsewhere the classic anti-steering rule still applies: no in-app links or calls to action for external purchase of digital goods. This area changes fast — verify against the current 3.1.1 and 3.1.3 text and Apple's 'Apps on the App Store in the US/EU' pages before shipping.",
    category: "Payments and IAP",
    kind: "rule",
  },
  {
    title: "What are reader apps allowed to do (3.1.3)?",
    body: "Guideline 3.1.3(a) lets 'reader' apps — magazines, newspapers, books, audio, music, video, professional databases — allow a user to sign in to an account created outside the app to access content they already paid for, without offering IAP. The External Link Account Entitlement (apply in App Store Connect, per-region) additionally lets approved reader apps show one link to their website for account creation/management — with a required Apple disclosure sheet, and the link must open the website directly, not a purchase-optimized interstitial. The entitlement is reviewed manually and must be requested before submission. If your app sells content AND features beyond reading (e.g., community, courses), reviewers may deny reader status and require IAP for the digital parts.",
    category: "Payments and IAP",
    kind: "rule",
  },
  {
    title: "My IAP was rejected — what do reviewers test?",
    body: "Reviewers run the purchase flow in the sandbox: they tap buy on each IAP you marked 'ready to submit', verify the product is delivered, prices display correctly, and a Restore Purchases button exists and works (required for non-consumables and subscriptions; its absence is a classic 3.1.1/2.1 rejection). Common failures: IAP products not submitted together with the build (must be 'Ready to Submit' and attached to the version), price shown in the UI not matching App Store Connect, subscriptions without visible duration/price/terms before the pay button, and no functional restore path. Also: a paywall that blocks all usage of a paid app with no free trial explanation, or that continues billing after account deletion, draws scrutiny.",
    category: "Payments and IAP",
    kind: "pitfall",
  },
  {
    title: "Google Play Payments policy — is it the same as Apple's?",
    body: "Mostly parallel, but with differences developers trip on. Google Play's Payments policy requires Google Play Billing for digital goods, same as Apple's 3.1.1. But Google has formalized alternative billing programs in several regions (user choice billing in the EEA, India, Korea, and others — as of early 2026, check the current list) with a service-fee reduction of a few percentage points, not zero. Google is generally more tolerant of account sign-in for content bought elsewhere but still enforces anti-steering inside the app for covered regions. Physical goods must not use Play Billing, same as Apple. Enforcement is automated: Play scans APKs/AABs for non-Google billing SDKs and flags them pre-review.",
    category: "Payments and IAP",
    kind: "fact",
  },

  // ── Privacy and permissions ─────────────────────────────────────────────────

  {
    title: "Why do apps get rejected under 5.1.1 Privacy?",
    body: "5.1.1 requires that apps only collect data they need, disclose it in the App Privacy 'nutrition labels', and get consent. Rejection triggers reviewers actually hit: the privacy labels say 'no data collected' while the app visibly contains analytics/ad SDKs (reviewers and automated scans check for Firebase, Adjust, Meta SDK network calls); a privacy policy link that is dead, generic, or does not match the app's actual collection; requesting permissions (location, contacts, photos, tracking) at launch with no context; and missing or boilerplate purpose strings. The privacy policy URL must be functional at review time and cover every data type your SDKs touch. Audit your actual network traffic with a proxy once — what you ship and what you declare must match.",
    category: "Privacy and permissions",
    kind: "rule",
  },
  {
    title: "What is the in-app account deletion requirement (5.1.1(v))?",
    body: "Since 2022, any app that supports creating an account must let users delete that account from inside the app — guideline 5.1.1(v). Reviewers test this: they create an account with the demo credentials and look for the deletion path. Requirements that bite: deletion must be real deletion of the account and associated data (not just sign-out or 'deactivation'), must be reachable in a reasonable number of taps, and must not require emailing support or visiting a website as the only path. You may send the user to a web flow to finish, but the entry point must be in-app. 'Delete my data but keep my account' options are fine as additions, not substitutes. This is a top-5 rejection reason for account-based apps.",
    category: "Privacy and permissions",
    kind: "rule",
  },
  {
    title: "My permission purpose strings got auto-rejected — why?",
    body: "App Store Connect validation (and later review) rejects builds where an Info.plist usage-description string is missing, empty, or generic. The error for missing keys is ITMS-90683 at upload time; vague strings fail later in human review. Purpose strings must name the concrete user-facing feature: 'We use your location to show nearby drivers' passes; 'This app needs location access' or marketing filler does not. Every sensitive API needs one: camera, photo library, microphone, contacts, location (when-in-use and always — 'always' needs strong justification), Bluetooth, local network, motion, tracking (plus AppTrackingTransparency for cross-app tracking). Rule of thumb: write the string as the answer to 'why does this app need this, right now?'",
    category: "Privacy and permissions",
    kind: "pitfall",
  },
  {
    title: "What is the privacy manifest and when does it block me?",
    body: "Apple requires a PrivacyInfo.xcprivacy manifest in apps and in listed third-party SDKs, declaring required-reason API usage and tracking domains. Since May 2024, uploads that use a required-reason API (file timestamps, system boot time, disk space, user defaults, etc.) without a declared reason produce ITMS-91053-style warnings that become hard upload errors. Practically: if you embed Firebase, analytics, or ad SDKs, you depend on those SDKs shipping valid manifests — an outdated SDK version with a missing or malformed manifest blocks your App Store upload, not just review. Fix by upgrading SDKs to versions that include manifests and adding your own manifest with the correct reason codes (e.g., CA92.1, C617.1). As of early 2026 this is enforced at upload, before any human sees the build.",
    category: "Privacy and permissions",
    kind: "fact",
  },
  {
    title: "What does Google Play's Data safety form actually require?",
    body: "The Data safety section in Play Console is a sworn declaration of what data your app collects, shares, and how it is secured — and Google cross-checks it. Under the User Data policy, mismatches between the form and actual behavior (e.g., declaring 'no data shared' while an ad SDK transmits the advertising ID) are a policy violation that can remove the app. The form asks per data type: collected or shared, purpose, optional vs required, encrypted in transit, and whether users can request deletion. Since 2024 the deletion requirement is real: apps with account creation must provide a deletion path and disclose it in the form, with a web link for deletion requests. Fill it from an actual audit of your SDKs' data flows, not from guesses — SDK vendor docs (Firebase, Meta) publish the values you should declare.",
    category: "Privacy and permissions",
    kind: "rule",
  },

  // ── Metadata and screenshots ────────────────────────────────────────────────

  {
    title: "What metadata mistakes trigger 2.3 Accurate Metadata?",
    body: "2.3 covers everything in the store listing: screenshots, preview videos, description, keywords, and the app name must reflect the app as it actually works. Concrete triggers: screenshots showing UI that does not exist in the build (reviewers compare your screenshots against the live app — mismatched screens are a real rejection, not a myth); screenshots or descriptions referencing other platforms ('our Android users', Google Play badges, Android device frames or status bars); descriptions mentioning features locked behind a roadmap ('coming soon' for core features); and keyword fields stuffed with competitor names or irrelevant trending terms, which also feeds 4.3/2.3 spam flags. Keep one version's metadata truthful for the build it ships with; update screenshots whenever UI changes materially.",
    category: "Metadata and screenshots",
    kind: "rule",
  },
  {
    title: "Are there hard rules for screenshot format and content?",
    body: "Technically: screenshots must be the correct pixel dimensions for each declared device class (6.9\"/6.7\" iPhone, 13\" iPad, etc.) — App Store Connect rejects wrong sizes at upload. Content-wise: device frames are allowed if they depict Apple devices accurately, but they must not obscure the app UI; screenshots must be captured from or faithfully represent the actual app; and no imagery suggesting other platforms. App preview videos follow stricter rules: only captured in-app footage plus simple titles — no hands holding phones, no people, no behind-the-scenes material. For Google Play: feature graphic and screenshots must not contain store badges, 'editor's choice' claims, or pricing. Overproduced marketing frames with UI that is not real is a recurring 2.3 trigger.",
    category: "Metadata and screenshots",
    kind: "rule",
  },
  {
    title: "Can I get rejected for my app name or keywords?",
    body: "Yes. Names and subtitle are limited (30 characters each on Apple) and must not include prices, 'free' claims, other app names, or unrelated popular terms — that is both 2.3 and the metadata-spam clause of 4.3. The 100-character keyword field is the classic stuffing vector: competitor names, celebrity names, and trending-but-irrelevant terms get flagged, sometimes weeks after approval by automated sweeps, and repeated keyword abuse feeds into account-level spam review. On Google Play, the short/full description is policed under the Store Listing policy for keyword stuffing and unattributed testimonials ('#1 app', fake quotes). Use only terms a user searching for your actual functionality would type.",
    category: "Metadata and screenshots",
    kind: "pitfall",
  },
  {
    title: "What are the rules for the 'What's New' text and review notes?",
    body: "Release notes are reviewed metadata too: they must describe the actual changes in the build (2.3), and they are a terrible place for marketing, upsells, or re-engagement copy directed at lapsed users — Apple rejects 'What's New' text that does not match the diff. Separately, the App Review Information notes field (not user-visible) is your highest-leverage review asset: state the demo account credentials, the exact tap path to any non-obvious feature, any hardware/server dependencies, and — if relevant — a short justification quoting the guideline you believe applies (e.g., 'digital goods are consumed outside the app per 3.1.1'). Reviewers read these first; a build with clear notes survives scrutiny that sinks unexplained builds.",
    category: "Metadata and screenshots",
    kind: "example",
  },

  // ── Rejections and appeals ──────────────────────────────────────────────────

  {
    title: "How do I appeal an App Store rejection, and does it work?",
    body: "Two distinct moves, in Resolution Center inside App Store Connect. First, reply to the reviewer directly in the rejection thread: many rejections are misunderstandings fixed by a one-message clarification with a screenshot or video showing the flagged feature working. Second, if the reviewer maintains the rejection, appeal to the App Review Board from the same thread. The Board overturns rejections when you show the guideline was misapplied — quote the exact guideline text and map your app's behavior to it, cite approved comparable apps doing the same thing, and stay factual. Appeals that complain about business impact, deadlines, or reviewer competence go nowhere. Realistic Board response time is days to a couple of weeks; a well-argued Board appeal on a genuinely misapplied guideline succeeds often enough to always be worth filing before giving up.",
    category: "Rejections and appeals",
    kind: "rule",
  },
  {
    title: "Should I resubmit or appeal — what is the difference in outcome?",
    body: "Resubmit when the rejection is factually right and fixable: crash, missing demo account, dead link, wrong screenshot. A fixed resubmission is faster than arguing. Appeal (or clarify in-thread) when the rejection rests on a wrong premise: the reviewer missed the feature (point to it, with a timestamped video), or applied the wrong guideline (explain why another guideline governs). Do not resubmit an unchanged binary hoping for a different reviewer — that pattern gets flagged and poisons future review times. If you both fix and dispute, say explicitly in review notes what changed. One nuance: metadata-only rejections can be resolved without a new binary by editing the listing and replying — do not push a new build for a screenshot problem.",
    category: "Rejections and appeals",
    kind: "rule",
  },
  {
    title: "When does Apple grant expedited review?",
    body: "Expedited review is requested from App Store Connect (Contact Us → request expedited review) and is granted for two credible cases: a critical bug fix for an app already on the store (crash on launch, data loss, security issue), and time-sensitive events tied to a fixed external date (app linked to a conference, product launch, seasonal event). It is not for faster routine releases — abusing it burns goodwill and Apple tracks request frequency. In the request, state the specific bug or date, the affected version, and why the normal timeline fails you. Granted requests typically review within 24–48 hours. There is no equivalent formal channel on Google Play, but Play's review is usually faster; for urgent Play fixes, releasing to a high-percentage staged rollout still requires review.",
    category: "Rejections and appeals",
    kind: "fact",
  },
  {
    title: "What tone and evidence overturn rejections?",
    body: "What works: short, factual, guideline-anchored. Structure: (1) quote the rejection and guideline, (2) state precisely what the app does, (3) explain the mismatch with evidence — a screen recording showing the feature, a document proving licensure, a link to the rule text, or names of live comparable apps, (4) one sentence asking for the specific outcome. What fails: long narratives, frustration, claims about revenue or investors, threats to leave the platform, and 'other apps do it' without naming them. If the rejection involves a factual claim about your business (licenses, permissions from IP holders, government authorization), attach the document — documentary evidence is the single strongest overturn lever. Keep everything in the Resolution Center thread so the record is complete for the Board.",
    category: "Rejections and appeals",
    kind: "example",
  },
  {
    title: "How do I appeal a Google Play policy decision?",
    body: "Play appeals go through the Play Console policy status page (the 'Appeal' button on the violation) — not email. You get one substantive shot per decision, so make it complete: address the exact policy named in the enforcement email, explain the app's actual behavior, attach screenshots/video or documentation, and if you already shipped a fix, give the version code where it is fixed. Play's reviewers respond in roughly a few days to two weeks; the response is often templated, so clarity matters. If an appeal is denied and the app stays removed, the only paths are a corrected resubmission (often under the same package name if the app was suspended but the account is healthy) or, for termination-level decisions, the formal appeal form linked in the termination notice.",
    category: "Rejections and appeals",
    kind: "rule",
  },

  // ── Google Play policies ────────────────────────────────────────────────────

  {
    title: "What is the 12 testers / 14 days rule for new Play accounts?",
    body: "Personal (individual) developer accounts created after November 2023 must run a closed test before they can publish to production: at least 12 testers opted in continuously for the last 14 days, with testers actually engaging with the app. Only then does 'production access' unlock, via a separate application where you describe your testing. As of early 2026 this still applies to personal accounts; organization/business accounts (D-U-N-S verified) are exempt. Practical consequences: recruit real testers (the 14-day clock resets if testers drop below 12), collect written feedback because Google asks what you learned, and budget roughly three extra weeks into any launch plan for a brand-new personal account. Verify the current thresholds on the Play Console Help 'closed testing requirements' page before planning a launch.",
    category: "Google Play policies",
    kind: "rule",
  },
  {
    title: "What are the target API level deadlines on Google Play?",
    body: "Google requires new apps and updates to target a recent API level, stepping up each year shortly after each Android release. As of early 2026: new apps and app updates must target API 35 (Android 15); existing apps targeting older levels remain installable but stop being discoverable/installable on newer devices, and a mid-2026 step to API 36 (Android 16) has been announced — confirm exact dates on the Play 'target API level requirements' page before a release. Missing the deadline blocks the release in Play Console with a policy error, and there is no appeal, only an extension form (available for a limited window, typically to November of the deadline year). Test on the target SDK early: behavior changes (notification permission, foreground service rules, edge-to-edge enforcement) cause real breakage, not just a number bump.",
    category: "Google Play policies",
    kind: "rule",
  },
  {
    title: "What app content declarations does Play Console require?",
    body: "Before production release, Play Console requires a stack of declarations, each a potential rejection point: content rating questionnaire (IARC — misrating violence/gambling/UGC is enforced), target audience and content settings (selecting children triggers the Families policy and its SDK restrictions), Data safety form, ads declaration (does the app contain ads — declaring 'no' while AdMob is integrated is a violation), news app declaration, health app declaration, COVID-era government app rules (still restricted to official entities), and permissions declarations for sensitive permissions (SMS/Call Log require a declared core-use case and a video demonstrating it; most apps are simply refused). Treat the declarations as legal statements: Google enforces mismatches retroactively, sometimes months later, via automated detection.",
    category: "Google Play policies",
    kind: "fact",
  },
  {
    title: "What are Google Play's Deceptive Behavior and User Data policies in practice?",
    body: "Deceptive Behavior covers misleading claims in the listing (fake functionality, impersonation, 'antivirus' that scans nothing), misrepresentation of the app's origin, and hidden or dishonest functionality — the Play analogue of Apple's 2.3.1, enforced partly by static and dynamic APK analysis. User Data policy requires a prominent in-app disclosure and consent before collecting personal/sensitive data, limits background collection (location accessible only when it delivers a current user-facing feature — background location needs a declaration and video), and bans selling user data. Both policies generate automated takedowns with limited human context in the first notice; the appeal path is where you supply context. If your app was flagged, first reproduce what the scanner could have seen: SDK data calls, background services, permission usage.",
    category: "Google Play policies",
    kind: "rule",
  },
  {
    title: "How do Google Play strikes and enforcement escalation work?",
    body: "Play distinguishes app-level actions (rejection of an update; removal/suspension of an app) from account-level action (termination). Suspensions count as strikes against the account; repeated suspensions — Google does not publish an exact count, but the documented pattern is 'multiple' — or one egregious violation (malware, systematic deception) terminates the account, and terminated developers are banned from opening new accounts, enforced via identity, payment, and signing-key linkage. Rejections of new submissions do not count as strikes; suspensions of live apps do. When you receive a suspension, fix before resubmitting: resubmitting an unchanged app after suspension is itself treated as repeat violation behavior. Keep a clean account by treating every policy warning email as a deadline, because stated grace periods (often 7–30 days) are real.",
    category: "Google Play policies",
    kind: "fact",
  },

  // ── Special categories ──────────────────────────────────────────────────────

  {
    title: "What do UGC apps need to pass review (1.2)?",
    body: "Apple guideline 1.2 (Safety — User Generated Content) requires, and reviewers actively test for: a method to report objectionable content, the ability to block abusive users, published contact information, and filtering/moderation of objectionable material, plus terms that prohibit it. The report/block affordances must actually work in the build — reviewers flag dead report buttons. Google's UGC policy under its User-Generated Content rules mirrors this: in-app reporting, blocking, and an effective moderation system with stated enforcement. The rejection usually comes when the feature exists but is buried, non-functional, or when the app can surface pornographic or CSAM-adjacent content with no moderation story. Document your moderation (human, automated, or hybrid) in the review notes — one sentence there preempts the most common 1.2 bounce.",
    category: "Special categories",
    kind: "rule",
  },
  {
    title: "What are the kids category rules that kill apps?",
    body: "Apple's Kids Category (guideline 1.3) and Google Play's Families policy are the strictest regimes in both stores. Core rules: no third-party analytics or advertising SDKs that collect or transmit personal data from children (with narrow exceptions for contextual, non-profiling ads and strictly limited analytics), no behavioral advertising, no external links or purchase opportunities reachable without a parental gate, and human review of ad content. Practically, this means the standard Firebase Analytics + AdMob stack is disqualifying in kids apps — the usual fix is ripping out third-party SDKs entirely or using self-hosted/first-party analytics. Also required: a privacy policy written for kids' data, COPPA/GDPR-K compliance, and on Play, the correct target-audience declaration plus enrollment in the Designed for Families program. Misdeclaring audience (marking 'not for children' while clearly child-directed) is a termination-grade violation on Play.",
    category: "Special categories",
    kind: "rule",
  },
  {
    title: "What do gambling, crypto, and finance apps need to show?",
    body: "Real-money gambling (Apple 5.3): the app must be free on the store, must hold all licenses/permits for every territory where it is usable, must geo-restrict so unlicensed territories cannot play, and reviewers ask for license documentation. Google Play similarly permits real-money gambling only in listed countries with a completed application and proof of license. Crypto (Apple 3.1.5): wallets are fine; exchanges must be offered by licensed/established exchanges; apps may not mine crypto on-device; NFT-related unlocking of in-app features must go through IAP; wallet apps from unlicensed entities get bounced. Finance broadly: loan apps face aggressive personal-loan rules on Play (country-specific license declarations, APR caps, 60+ day terms) and Apple rejects unlicensed lending outright. In all three categories, upload documentation proactively in review notes — waiting for the rejection to prove licensure costs a week.",
    category: "Special categories",
    kind: "rule",
  },

  // ── Account safety ──────────────────────────────────────────────────────────

  {
    title: "What gets a whole developer account banned, not just an app rejected?",
    body: "Account-level enforcement follows patterns of dishonesty, not bugs. On Apple: repeated 4.3 spam submissions, hidden features (2.3.1), fake reviews or review manipulation, fraudulent IAP behavior, and identity misrepresentation lead to Apple Developer Program termination — appealable to the Board within a stated window, after which the agreement is void and re-enrollment is blocked. On Google Play: malware, systematic policy evasion, repeated suspensions, and prior-termination evasion (new accounts linked by identity, payment instruments, keystores, or shared infrastructure) lead to termination with no realistic path back. The trap that catches honest developers: associating with a terminated account — sharing a signing key, Mac, payment card, or contractor with someone banned can cascade termination onto your account. Keep your signing credentials, payment methods, and machines clean of other people's apps.",
    category: "Account safety",
    kind: "pitfall",
  },
  {
    title: "Is buying reviews or incentivized ratings worth the risk?",
    body: "No — both stores treat review manipulation as account-threatening fraud, and detection is statistical: bursts of 5-star reviews from new accounts, review text similarity, device/IP clustering, and incentivized-review SDK fingerprints. Apple's guidelines prohibit incentivizing or filtering ratings (the pre-review 'are you enjoying the app?' prompt that routes happy users to the store and unhappy ones to support — 'review gating' — is itself a violation). Google Play's ratings policy bans incentivized reviews outright. Enforcement lands asymmetrically: your purchased reviews get wiped, but the manipulation flag stays on the account and colors every future review of every future submission. The legitimate lever is Apple's SKStoreReviewController / Play's in-app review API: prompted at genuine success moments, unfiltered, and rate-limited by the platform.",
    category: "Account safety",
    kind: "pitfall",
  },
  {
    title: "What is bait-and-switch after approval, and how is it caught?",
    body: "Bait-and-switch is submitting a benign app for review and then changing what users get: flipping server-side flags to unlock gambling or adult content, replacing the app's content with a different app via a hot-updating framework, or altering the store listing after approval to sell something else. Both stores catch it through post-approval re-review sweeps, user reports, competitor reports, and binary/dynamic analysis — Apple explicitly reserves re-review rights and Play runs continuous scanning. This maps to Apple's 2.3.1 and Play's Deceptive Behavior policy, and it is consistently treated as intentional deception: the outcome is removal plus account termination, not a rejection you can appeal on the merits. Legitimate server-driven changes are fine when the reviewed and shipped experiences are substantively the same; the violation is the material difference, not the remote config itself.",
    category: "Account safety",
    kind: "pitfall",
  },
];
