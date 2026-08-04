export const NOTES: {
  title: string;
  body: string;
  category: string;
  kind: "fact" | "rule" | "layout" | "example" | "pitfall";
}[] = [
  // ─── Webhooks and idempotency ───
  {
    title: "Webhook fires twice — did I double-charge?",
    body: "No, if you dedupe correctly. Stripe delivers webhooks at-least-once, not exactly-once: the same event object can arrive multiple times, and events can also arrive out of order. Your handler MUST record the event id (evt_...) and skip already-processed ids, ideally with a unique constraint in your database so concurrent retries can't both pass the check. Make the handler itself idempotent too — e.g. 'mark order paid' not 'increment paid count'. Never key dedupe on the object id (invoice, charge) alone: one invoice legitimately produces many events. Reply 2xx only after durable processing; any other status (or a timeout) tells Stripe to retry.",
    category: "Webhooks and idempotency",
    kind: "rule",
  },
  {
    title: "How long does Stripe retry a failed webhook?",
    body: "Stripe retries webhook deliveries on an exponential-ish backoff over roughly three days in live mode (test mode retries for a shorter window). Delivery attempts show up in the Dashboard under Developers → Webhooks, and you can replay events manually from there. If your endpoint fails continuously for a sustained period, Stripe emails you and may automatically disable the endpoint — a disabled endpoint silently stops receiving events, which is how teams 'lose' subscription cancellations for weeks. Monitor endpoint health, alert on failure rate, and treat any gap as a reason to reconcile via the Events API (list events since last processed) rather than assuming no news is good news.",
    category: "Webhooks and idempotency",
    kind: "fact",
  },
  {
    title: "Do I need to verify webhook signatures?",
    body: "Yes, always, with stripe.webhooks.constructEvent() and the endpoint's signing secret (whsec_...). An unverified endpoint is an unauthenticated POST route on your server — anyone who finds the URL can forge a checkout.session.completed and grant themselves paid access, a classic free-product exploit. Signature verification also enforces a timestamp tolerance (a few minutes) to blunt replay attacks. Gotcha: constructEvent needs the RAW request body, so in Express use express.raw({type: 'application/json'}) for the webhook route, not express.json(). In Next.js route handlers read await req.text(), never req.json(). Parse-as-JSON-then-verify always fails because re-serialization changes the bytes.",
    category: "Webhooks and idempotency",
    kind: "rule",
  },
  {
    title: "checkout.session.completed or charge.succeeded — which one grants access?",
    body: "They mean different things. checkout.session.completed fires when the Checkout Session finishes — but for async payment methods (bank debits, some wallets) the payment may still be processing, and for subscriptions with a trial there may be no charge at all. charge.succeeded fires per successful charge but also fires for payments made outside Checkout. Robust pattern: handle checkout.session.completed to link the session to your user (via client_reference_id or metadata), and grant/extend access on invoice.paid (subscriptions) or payment_intent.succeeded (one-time, after confirming status isn't requires_action). Also handle checkout.session.async_payment_succeeded and ...async_payment_failed if you accept async methods.",
    category: "Webhooks and idempotency",
    kind: "rule",
  },
  {
    title: "Stripe webhook events arrived out of order — what breaks?",
    body: "Anything that treats the latest received event as current state. Stripe does not guarantee ordering: you can get customer.subscription.updated (canceled) before the updated (active) from an earlier change, and end up resurrecting a canceled subscription. Never blindly overwrite local state from the event payload. Instead, when an event touches a subscription or customer, fetch the object's CURRENT state from the API (or at minimum compare the event's created timestamp against your last-processed timestamp for that object). The 'fetch current state on event' pattern makes ordering irrelevant and also protects against missed events. This is the single most common state-corruption bug in Stripe integrations.",
    category: "Webhooks and idempotency",
    kind: "pitfall",
  },
  // ─── Subscriptions and lifecycle ───
  {
    title: "What statuses can a Stripe subscription be in, and which transitions bite?",
    body: "Lifecycle: incomplete → active (or trialing) → past_due → unpaid or canceled, plus incomplete_expired. incomplete means the first payment needs action (SCA) — it auto-expires after about 23-24 hours to incomplete_expired if never paid. past_due means a renewal failed but dunning retries are still running; per your retry settings it then goes to unpaid, canceled, or stays past_due while access continues. canceled is terminal — you can't un-cancel, you must create a new subscription. Paused subscriptions (via pause_collection) report status active, so check the pause_collection field separately. Map each status to an access decision in ONE place in your code; scattered status checks drift apart.",
    category: "Subscriptions and lifecycle",
    kind: "fact",
  },
  {
    title: "Upgrade mid-cycle: why is the invoice weird (proration)?",
    body: "Changing a subscription's price by default creates prorations: Stripe credits unused time on the old price and bills the new price's remaining time, either on the next invoice or immediately. The proration_behavior parameter controls this: 'create_prorations' (default — line items now, charged next invoice), 'always_invoice' (charge immediately), or 'none' (no proration — simplest and often what SaaS actually wants for downgrades). Pitfalls: create_prorations + a failed next payment means upgrades effectively free until then; downgrading with create_prorations can leave a customer credit balance that offsets future invoices. Pending proration line items appear as upcoming invoice lines, confusing 'why is my next bill not the plan price' support tickets.",
    category: "Subscriptions and lifecycle",
    kind: "fact",
  },
  {
    title: "Cancel at period end vs cancel immediately — which API?",
    body: "Two different mechanisms. Setting cancel_at_period_end=true on the subscription keeps it active until current_period_end, then cancels it — you get customer.subscription.updated with cancel_at_period_end=true when it's set, and customer.subscription.deleted only when the period actually ends. Deleting the subscription (DELETE /v1/subscriptions/:id) cancels immediately and fires customer.subscription.deleted right away; you can pass prorate/invoice_now options to issue a credit for unused time. Common bug: granting access 'until subscription.current_period_end' but revoking on the updated event, cutting off users who paid through the end of the month. Revoke access on deleted (or when period end passes), not on the flag change.",
    category: "Subscriptions and lifecycle",
    kind: "example",
  },
  {
    title: "How do trials without a card work, and when does trial_end fire?",
    body: "You can create a subscription with trial_end (Unix timestamp, seconds) and no payment method — status becomes trialing. Stripe fires customer.subscription.trial_will_end about 3 days before trial end (only if the subscription will attempt payment after), which is your 'add a card' prompt trigger. When the trial ends: if a payment method exists, Stripe invoices and on success fires invoice.paid plus subscription updated to active; if none exists, behavior depends on your settings — the subscription goes past_due or cancels. trial_end must be a whole-number Unix timestamp in SECONDS, not milliseconds — passing Date.now() puts the trial in year 56,000 and Stripe rejects it (or worse, you store garbage locally).",
    category: "Subscriptions and lifecycle",
    kind: "example",
  },
  {
    title: "customer.subscription.updated fires constantly — which change do I care about?",
    body: "It's a catch-all: plan changes, quantity changes, cancel_at_period_end flips, status transitions, even metadata edits all emit it, often several per action. Don't treat each one as a meaningful event. Diff against your stored copy: compare status, items (price ids, quantities), cancel_at_period_end, and current_period_end, and only act on fields you actually model. If you need causality, inspect the event's data.previous_attributes field — it lists exactly which attributes changed in that event, which is far more reliable than guessing from the payload. For pure state-sync use cases, ignore event semantics entirely and just upsert the subscription object as-is; reserve logic for deleted, trial_will_end, and invoice events.",
    category: "Subscriptions and lifecycle",
    kind: "rule",
  },
  // ─── Dunning and failed payments ───
  {
    title: "invoice.payment_failed — what do I do with it?",
    body: "It's your dunning trigger. It fires when a charge for an invoice fails — for subscriptions that includes renewal attempts. The invoice's attempt_count and next_payment_attempt fields tell you where you are in the retry sequence. Your app should: email the customer, set an internal grace-period timer, and point them at a self-serve card-update page (a fresh Checkout Session in setup mode, or the customer portal). Do NOT immediately revoke access on the first failure — most failures are transient (insufficient funds timing, bank declines) and Smart Retries recover a large share. Revoke when the subscription transitions to unpaid/canceled per your Billing retry settings, i.e. on customer.subscription.updated with a terminal-ish status.",
    category: "Dunning and failed payments",
    kind: "rule",
  },
  {
    title: "How do Smart Retries actually work?",
    body: "Stripe's Smart Retries (the default dunning mode) uses machine learning to pick retry times within a configurable window, rather than fixed intervals, because decline types respond differently to timing (payday effects, card velocity limits). You can instead define custom retry rules (e.g. retry after 3, 5, 7 days) in Dashboard → Settings → Billing → Subscriptions and emails. There you also set the final outcome when retries are exhausted: mark subscription unpaid, cancel it, or leave it past_due. As of early 2026 this is configured in the Dashboard (and partially via the API on accounts with Billing features enabled), not per-subscription by default. Hard declines (stolen card, closed account) aren't retried regardless.",
    category: "Dunning and failed payments",
    kind: "fact",
  },
  {
    title: "Customer's card expired at renewal — can I prevent that failure?",
    body: "Mostly yes, for free. Stripe automatically works with card networks' account updater services: when an issuer replaces or expires a card, Stripe often receives the new details and updates the saved payment method without customer involvement — this silently prevents a large fraction of renewal failures. You still must handle the remainder. Watch invoice.upcoming (fires ~3 days before renewal) to warn users with expiring cards, and on invoice.payment_failed route them to update their card. Note the failure code: 'expired_card' and hard declines warrant immediate outreach; 'insufficient_funds' warrants patience and retries. Never auto-retry aggressively from your own code on top of Smart Retries — issuers may flag the merchant for excessive attempts.",
    category: "Dunning and failed payments",
    kind: "fact",
  },
  {
    title: "Should past_due subscribers keep access during dunning?",
    body: "Decide explicitly — Stripe won't decide for you. Statuses past_due and unpaid still bill the customer when a retry eventually succeeds, so cutting access on day one means users who get recovered by Smart Retries churn angrily; keeping full access indefinitely means free riders. Standard SaaS pattern: full access for a grace period (commonly 3–14 days) after the first invoice.payment_failed, with escalating in-app banners and emails; downgrade to read-only or locked after that; fully revoke on unpaid/canceled. Encode the grace deadline yourself (first_failure_time + N days) — Stripe has no 'grace period' concept. And always restore access instantly when invoice.paid arrives; delayed restoration generates the worst support tickets.",
    category: "Dunning and failed payments",
    kind: "rule",
  },
  // ─── Checkout and Payment Intents ───
  {
    title: "PaymentIntent succeeded client-side — can I fulfill the order?",
    body: "No. Client-side confirmation (stripe.confirmPayment resolving without error) is a strong hint, not proof of money movement — fulfill only on the payment_intent.succeeded webhook (or a server-side retrieve confirming status). Reasons: webhook is the authoritative, signed channel; client state can be spoofed or raced; and for redirect-based methods (3DS, bank debits) the customer may never return to your success page. Pattern: create the PaymentIntent server-side, confirm client-side, show optimistic UI, but flip the order to 'paid' only from the webhook, deduped by event id. For strong consistency show 'processing' until the webhook lands and the client polls or receives a push. This rule also kills the 'success URL tampering' free-product exploit.",
    category: "Checkout and Payment Intents",
    kind: "rule",
  },
  {
    title: "Why does my PaymentIntent sit in requires_action forever?",
    body: "requires_action means the customer must complete authentication — usually 3D Secure/SCA — and nothing will progress until they do. With stripe.confirmPayment and a return_url, Stripe redirects the customer to their bank and back; if they close the tab mid-flow, the Intent stays in requires_action (or eventually requires_payment_method after abandonment/timeout) and you get no money and no failure event. Handle it: listen for payment_intent.requires_action / payment_intent.payment_failed webhooks, send an abandoned-payment email with a link that re-opens confirmation, and expire stale Intents. Don't create a new PaymentIntent per retry on the same order — reuse the same Intent (or its idempotency key) so you can't double-charge a customer who completes two flows.",
    category: "Checkout and Payment Intents",
    kind: "pitfall",
  },
  {
    title: "When does 3D Secure / SCA actually trigger?",
    body: "SCA (PSD2) applies when both the merchant's and cardholder's banks are in the EEA/UK — then 3DS is mandatory unless an exemption applies (low-value under ~€30, low-risk transaction-risk analysis, MIT/subscription exemptions for subsequent charges, corporate cards). Outside regulated regions, 3DS is optional but still available and shifts fraud liability to the issuer when completed. With Checkout and PaymentIntents using automatic payment methods, Stripe applies 3DS when required or when Radar rules request it (request_three_d_secure). Practical behavior: the FIRST subscription payment often needs 3DS; renewals usually run as merchant-initiated transactions without it — but issuers can still soft-decline with authentication_required, which is why dunning flows must support re-authentication via a hosted page.",
    category: "Checkout and Payment Intents",
    kind: "fact",
  },
  {
    title: "Do idempotency keys expire? Can I reuse them?",
    body: "Stripe stores idempotency keys for about 24 hours (as of early 2026; treat the exact window as Stripe-controlled). Within the window, retrying a POST with the same key returns the ORIGINAL response without re-executing — your safety net against double-creating charges or customers during timeouts. After the window, the same key executes as a fresh request. Rules: generate a key per logical operation (e.g. order UUID), not per request attempt; reuse it across retries of THAT operation only; never reuse keys across different operations or different users. Keys are per-account and apply to POST mutations. They don't make GETs idempotent (GETs already are), and they don't dedupe webhooks — that's the event-id job.",
    category: "Checkout and Payment Intents",
    kind: "fact",
  },
  {
    title: "Checkout success_url as the fulfillment signal — what's the worst case?",
    body: "Worst case is real and common: a customer pays, their bank's 3DS page or a browser crash prevents the redirect back, success_url never loads, and your app never provisions the product — an angry paying customer. The reverse also happens: users learn they can just visit /success?session_id=guessable and your naive handler grants access without payment (always verify the session server-side if you do anything on that page). The success_url is for UX only. Fulfillment must live in the checkout.session.completed / invoice.paid / payment_intent.succeeded webhook path, which fires regardless of whether the browser ever comes back. Treat every client-side success signal as 'probably paid, confirm pending'.",
    category: "Checkout and Payment Intents",
    kind: "pitfall",
  },
  // ─── Testing and going live ───
  {
    title: "How do I test a subscription renewal without waiting a month?",
    body: "Use test clocks (as of early 2026 available via the API and Dashboard). Create a test clock, attach a customer to it when creating them, create the subscription, then advance the clock: Stripe fast-forwards time and emits the full webhook sequence — invoice.upcoming, invoice.created, payment attempts, payment_failed on failure cards — exactly as if time really passed. You can simulate an entire dunning cycle or trial expiry in minutes. Limits: a test clock has a cap on attached customers, and clocks only advance forward. Alternative quick checks: Dashboard 'send test webhook' for handler smoke tests, and card 4000 0000 0000 0341 for attach-fails, 4000 0000 0000 9995 for insufficient funds on charge.",
    category: "Testing and going live",
    kind: "example",
  },
  {
    title: "We tested everything in test mode — what still breaks in live mode?",
    body: "The usual suspects: webhook endpoints exist only in test mode (you must register the live-mode endpoint separately, with its own whsec_ secret); restricted API keys scoped to test; SCA/3DS behavior (test cards simulate it, live issuers enforce it unpredictably); Radar rules that only run in live; bank-specific decline codes your test cards never produced; and webhook volume — live mode delivers bursts (renewal days, incident replays) that expose handler timeouts your staging never saw. Also: livemode flag on every object is your only guard against mixing test and live data — always check it in webhooks and ignore events whose livemode doesn't match your environment, or you'll corrupt production state with test events.",
    category: "Testing and going live",
    kind: "pitfall",
  },
  {
    title: "Should I store Stripe webhook secrets and keys per environment?",
    body: "Yes, and keep them strictly separated. You need at minimum: live secret key (sk_live_...), live webhook signing secret(s) (whsec_... per endpoint), and the test-mode pair. Webhook secrets are PER ENDPOINT, not per account — two endpoints means two secrets. Use restricted keys (rk_...) with least privilege for services that only need e.g. read access to subscriptions; keep the full secret key off anything internet-facing. Never ship secret keys to the client — publishable keys (pk_...) only. Rotate on suspicion via Dashboard (rolling rotation keeps the old key valid briefly). And don't hardcode: pull from env/secret manager, because a leaked sk_live_ in a repo is a 'drain the account via payouts-to-fraudsters' incident.",
    category: "Testing and going live",
    kind: "rule",
  },
  {
    title: "How do I replay webhooks locally during development?",
    body: "Use the Stripe CLI: `stripe listen --forward-to localhost:3000/api/webhooks` gives you a temporary signing secret and streams live test-mode events to your machine. `stripe trigger checkout.session.completed` (and other event types) synthesizes events on demand — fast for handler iteration, though triggered fixtures are shallower than real flows, so also do at least one real Checkout run against the listener. For production incidents, the Dashboard lets you resend individual past events to an endpoint — useful after your endpoint recovers from an outage, but resends can duplicate events your handler already processed, which is another reason event-id dedupe is non-negotiable. Never disable signature verification 'temporarily' to make local testing easier.",
    category: "Testing and going live",
    kind: "example",
  },
  // ─── Migrations and data moves ───
  {
    title: "How do I move subscribers from one Stripe account to another?",
    body: "You cannot do it self-serve — card PAN data belongs to the account that tokenized it. The official path: contact Stripe support and request a PAN data transfer between accounts (both accounts must be verified and in good standing; there are restrictions on cross-merchant moves). Stripe securely copies customer records and card details to the new account. What does NOT transfer: subscriptions, invoices, payment history, coupons, webhook configs, Radar data. You must recreate subscriptions in the new account (typically via API import with backdate_start_to / trial_end tricks to avoid recharging), remap every customer id (they change or must be re-mapped), and run both integrations in parallel during cutover. Plan weeks, not days, and keep the old account alive for refunds and disputes.",
    category: "Migrations and data moves",
    kind: "fact",
  },
  {
    title: "Migrating from Chargebee/Recurly/paddle to Stripe Billing — what's the plan?",
    body: "Standard sequence: (1) export customers + payment method tokens from the old provider — most providers coordinate a PAN/tokens export to Stripe via their support, similar to account-to-account transfer; (2) import customers and payment methods into Stripe, building an old_id → new_customer_id mapping table; (3) recreate subscriptions with billing_cycle_anchor / backdate_start_to set to the NEXT already-paid renewal date so nobody gets double-billed, and proration_behavior none; (4) cut over webhooks and disable subscription creation in the old system; (5) run parallel read-only reconciliation for one billing cycle. The classic bug: importing with the anchor = now, charging everyone a second time. Cancel old-platform subscriptions only after confirming the Stripe invoice schedule.",
    category: "Migrations and data moves",
    kind: "example",
  },
  {
    title: "Why do my local subscription records drift from Stripe over time?",
    body: "Because you mirror state from webhooks, and webhooks are lossy in practice: endpoint outages, disabled endpoints, missed event types after you add a feature (e.g. you never handled customer.updated), and ordering bugs all accumulate drift. The fix is periodic reconciliation, not more webhook handling. Nightly or weekly job: list active/trialing/past_due subscriptions from the API (paginated, created filters), diff against your database on status, price, quantity, period end, and repair or alert on mismatches. Use Stripe as the source of truth — never the other way around. Also reconcile money separately: match payout amounts to balance transactions (see reconciliation note) so accounting catches what subscription-state checks miss.",
    category: "Migrations and data moves",
    kind: "rule",
  },
  // ─── Billing edge cases ───
  {
    title: "Why is my invoice $0.50 when the plan is $50? (timestamps and anchors)",
    body: "Almost always a timestamp or anchoring bug. Stripe uses Unix timestamps in SECONDS everywhere — trial_end, billing_cycle_anchor, current_period_start/end in payloads. Passing JavaScript Date.now() (milliseconds) creates dates 1000x in the future; dividing incorrectly shifts periods. billing_cycle_anchor pins when the recurring invoice lands: set it when creating a subscription to force, say, the 1st of the month — Stripe then prorates the partial first period, producing that odd $0.50 'weird first invoice'. If you don't want the partial charge, combine the anchor with a trial ending at the anchor date. Always console-log derived timestamps as ISO dates during development; 'my customer was billed a random amount' is nearly always this class of bug.",
    category: "Billing edge cases",
    kind: "pitfall",
  },
  {
    title: "How much can I stuff into metadata?",
    body: "Metadata limits (as of early 2026): up to 50 key-value pairs per object, keys up to 40 characters, values up to 500 characters. It's for identifiers and annotations — your internal user id, order id, feature flags — not for documents. Don't store anything large (use your DB and store the reference), anything sensitive (metadata is visible in Dashboard and included in API responses — no PII you wouldn't show an employee, definitely no secrets), and don't rely on it for querying: you can list objects but not filter server-side by arbitrary metadata on most endpoints (some support search queries, e.g. the Search API with metadata['key']:'value'). Metadata updates fire updated webhooks, which can trigger your own handlers — another reason to diff before acting.",
    category: "Billing edge cases",
    kind: "fact",
  },
  {
    title: "Usage-based billing: why did the metered invoice explode?",
    body: "Metered/usage billing charges in arrears: you report usage (meters events, or the legacy usage records API on metered prices), Stripe aggregates and invoices at period end. Explosion causes: retrying usage-report requests without idempotency and double-counting; reporting cumulative totals when the meter expects increments (check the meter's aggregation formula — sum vs last_during_period vs max); and dev/test events landing on the live meter. Safeguards: dedupe usage events with your own event ids, alert on usage deltas above N× the customer average, and consider billing thresholds or a spending cap so runaway usage triggers incremental invoicing instead of a single monster invoice the card declines. A declined monster invoice then enters dunning — for an amount the customer disputes ever consuming.",
    category: "Billing edge cases",
    kind: "pitfall",
  },
  {
    title: "Can I charge a saved card whenever I want (off-session)?",
    body: "Yes, with conditions — this is merchant-initiated off-session charging. Save the payment method first via a SetupIntent (or a payment with setup_future_usage), which collects SCA upfront and records mandate/consent. Later, create a PaymentIntent with customer, payment_method, off_session: true, and confirm. Reality: issuers may still soft-decline with authentication_required — you must catch that error code and bring the customer on-session (email a link to a page that confirms the same Intent) rather than blindly retrying. Also required by card networks: clear terms at setup that you'll charge later, and sending pre-charge notification for subscriptions in some jurisdictions. Charging saved cards without prior agreement invites disputes you will lose.",
    category: "Billing edge cases",
    kind: "rule",
  },
  {
    title: "Customer paid but my bank payout doesn't match — how do I reconcile?",
    body: "Gross charges never equal payouts: Stripe deducts fees per transaction, holds refunds/disputes, and batches payouts. The reconciliation unit is the balance transaction (balance_transaction objects): every charge, fee, refund, adjustment, and payout is a set of them, and a payout's balance transactions sum exactly to the payout amount. Workflow: for a payout, list balance transactions by payout id; group by type (charge, fee via reporting category, refund, dispute); match charges back to your orders via the charge id / metadata. Use the Sigma or the Balance Transaction API for automation; Dashboard payout pages show the same breakdown manually. If you do accounting from invoice.paid amounts alone, your books will be wrong by exactly the fees and FX spreads.",
    category: "Billing edge cases",
    kind: "fact",
  },
  {
    title: "Never trust the client-side price — what does that mean concretely?",
    body: "Any amount or price computed in the browser is attacker-controlled. Concretely: never accept amount, currency, or plan name from request bodies and pass them to PaymentIntent/Charge creation; never let the client pick a Stripe Price id arbitrarily without server-side validation that it belongs to your catalog and matches the product the user selected; always look up the amount server-side from the Price id (or your own price table keyed by plan code). Checkout Sessions with line_items using price ids are safe by construction because amounts come from Stripe. The exploit is real: tampered amounts = products bought for €0.01. Same rule for quantities and for 'plan' strings your webhook later maps to entitlements.",
    category: "Billing edge cases",
    kind: "rule",
  },
  // ─── Disputes and fraud ───
  {
    title: "Got a chargeback — how long do I have and what wins?",
    body: "A dispute (charge.dispute.created webhook) opens when a cardholder contests a charge with their bank; Stripe immediately debits the disputed amount plus a dispute fee (varies by region, roughly $15 in the US as of early 2026 — check current pricing). Response windows are set by the card network and are short — typically about 7–21 days depending on network and reason code; the dispute object's evidence_details.due_by (Unix seconds) is authoritative. Winning evidence for SaaS: proof of account access/usage logs tied to the cardholder, acceptance of your ToS at signup, prior undisputed payments on the same card, AVS/CVC match results, and clear billing descriptor. Submit evidence once — you generally can't amend after submission. Countering fraud-coded disputes for digital goods rarely wins; subscription_canceled-coded ones often do with cancellation logs.",
    category: "Disputes and fraud",
    kind: "fact",
  },
  {
    title: "What does Radar actually block, and should I write rules?",
    body: "Radar is Stripe's ML fraud screening, on by default: it scores each payment and blocks or allows based on risk level you configure (Dashboard → Radar), plus optional custom rules ('block if :card_country: != :ip_country:', 'review if amount > X'). Key facts: a Radar block appears as a failed charge with a fraud-related decline — it is NOT a dispute and costs no dispute fee; 3DS, when completed, shifts fraud liability to the card issuer, which is why high-risk transactions are worth steering to 3DS via Radar rules (request_three_d_secure: any/ automatic). Custom rules beat ML thresholds for SaaS-specific patterns (trial abuse with disposable emails, card testing on your checkout). Watch for card-testing attacks: bursts of small declines — mitigate with rate limiting and CAPTCHA on checkout, Radar alone won't save an exposed endpoint.",
    category: "Disputes and fraud",
    kind: "fact",
  },
  {
    title: "Refunds: full, partial, and what happens to fees and subscriptions?",
    body: "A refund (refund.create on a charge or payment_intent) returns money to the original card; as of early 2026 Stripe generally does NOT return its processing fees on refunds. Partial refunds are supported; multiple partials can't exceed the charge total. Critically, refunding does NOT cancel the subscription — those are independent operations, and 'refunded but still subscribed' (they get billed again next month → dispute) and 'canceled but not refunded' (angry churned customer) are both classic support fires. Decide policy per case and do both actions deliberately. Refunds reduce your next payout via balance transactions, and can take days to weeks to appear on the customer's statement — set expectations in the confirmation email. Excessive refund/dispute ratios put your account at risk of reserves or termination.",
    category: "Disputes and fraud",
    kind: "rule",
  },
  {
    title: "Trial abuse and free-tier farming — how do I stop it?",
    body: "Attackers cycle disposable emails and stolen/disposable cards to harvest trials. Layered defenses that work: require a card for trials (kills most abuse, costs conversion — measure the tradeoff); fingerprint by card, not just email — check Stripe's customer/payment method for duplicate card fingerprints (the card fingerprint field is stable per PAN) and block repeat trials on the same card; use Radar rules to block prepaid cards and mismatched IP/card countries on trial signups; add CAPTCHA/email verification before trial activation; delay full feature access (export limits) until first successful payment. Track your dispute rate — card networks have monitoring programs with thresholds (around ~0.9% historically; verify current Visa/Mastercard program rules) that trigger fines and remediation.",
    category: "Disputes and fraud",
    kind: "pitfall",
  },
  // ─── Added: production incident runbooks ───
  {
    title: "Metered invoice exploded to $100k — how do I debug what happened?",
    body: "Work backwards from the invoice. Pull its line items, then inspect usage: for the legacy usage-records API, list usage record summaries for the subscription item; for meters, query the meter event summaries and the events behind them. Check usage record timestamps — records must land inside the billing period and use Unix seconds; a wrong-window or millisecond timestamp piles usage into one period. Check your side for duplicates: retries of usage-report calls without idempotency, queue consumers redelivering after a late ack, and reporters firing twice per request are the usual double-count sources. Verify the subscription's billing_cycle_anchor hasn't shifted the period. Then add guardrails: alert on invoice amount deltas versus the customer's trailing average, and use billing thresholds so runaway usage invoices incrementally.",
    category: "Billing edge cases",
    kind: "pitfall",
  },
  {
    title: "PaymentIntent stuck in requires_action — cancel it or keep waiting?",
    body: "requires_action means the customer never finished authentication, usually 3DS. Exact abandonment timeouts vary by payment method and flow — there is no single documented number to rely on — so treat 'stuck' as an operational state, not a clock you can trust. Run a periodic job that lists Intents sitting in requires_action or requires_confirmation older than your business window (e.g. a checkout session's lifetime), email the customer a link that resumes confirmation on the SAME Intent, and cancel the Intent once your window closes so it can't complete unexpectedly weeks later. Alert on the stale-Intent rate — a spike usually means your 3DS return_url or redirect flow is broken. Never create a second Intent for the same order; reuse and resume the existing one.",
    category: "Checkout and Payment Intents",
    kind: "rule",
  },
  {
    title: "Checkout Sessions or the Payment Intents API — which do I build on?",
    body: "Checkout is Stripe-hosted: you create a Checkout Session, redirect (or embed), and Stripe renders the payment page, handles SCA/3DS redirects and payment-method localization — least code, least PCI/SCA surface, least UX control. Key events: checkout.session.completed, plus async_payment_succeeded/async_payment_failed for delayed methods, and the underlying invoice.paid or payment_intent.succeeded. The Payment Intents API is fully custom: you render your own form with Stripe.js/Elements or the Payment Element, confirm client-side, and own the UX — but you must handle requires_action, redirects, errors, and retries yourself; SCA still applies automatically when required. Rule of thumb: default to Checkout (or Payment Links) for standard SaaS; drop to Payment Intents when you need native in-app UX or payments embedded in a larger custom flow.",
    category: "Checkout and Payment Intents",
    kind: "fact",
  },
  {
    title: "Renewal fails — what does Stripe do automatically, and what's on me?",
    body: "Stripe's automatic side: it generates the renewal invoice, attempts the charge, transitions the subscription to past_due on failure, and runs dunning per your Billing settings — Smart Retries (the default) uses ML to pick retry times rather than fixed intervals, and a custom schedule is available; check your Dashboard for the exact days rather than hardcoding any pattern. When retries are exhausted, Stripe applies your configured final action: mark the subscription unpaid, cancel it, or leave it past_due. Your three duties: (1) notify — emails and in-app warnings on invoice.payment_failed with a self-serve card-update link; (2) access policy — define the grace window during past_due and enforce revocation on unpaid/canceled; (3) watch — handle customer.subscription.updated and reconcile, because Stripe keeps retrying whether you notice or not.",
    category: "Dunning and failed payments",
    kind: "rule",
  },
  {
    title: "Crash mid-charge — do I reuse the same idempotency key on retry?",
    body: "Yes — that is exactly what it's for. Send the Idempotency-Key HTTP header (or the idempotencyKey option in the SDKs) on POST requests like creating a PaymentIntent, Charge, Customer, or Subscription. If your process crashes or times out after Stripe received the request, retrying with the SAME key returns the original cached response without executing the mutation again — no duplicate charge. Stripe retains keys for about 24 hours; within that window the replay is guaranteed, after it the key acts as new. Generate one key per logical operation (an order or checkout UUID), store it with the order, and reuse it across all retries of that operation. Never reuse a key for a different operation or customer. Client-side double-clicks are covered by the same server-issued key.",
    category: "Webhooks and idempotency",
    kind: "rule",
  },
  {
    title: "Can I run a trial without collecting a card upfront?",
    body: "Yes. Create the subscription with trial_end (or trial_period_days) and no payment method; with payment_behavior: 'default_incomplete' (the default) it starts in trialing while the trial runs. Control the no-card-at-trial-end case explicitly with trial_settings.end_behavior.missing_payment_method: 'cancel' cancels the subscription when the trial ends without a card — otherwise Stripe creates an invoice and the subscription slides into past_due dunning for a customer who never agreed to pay. Listen for customer.subscription.trial_will_end (about 3 days before) to prompt card collection via a SetupIntent or a setup-mode Checkout Session. Tradeoff: cardless trials convert better but invite abuse — disposable emails farming trials. Mitigate with email verification, CAPTCHA, and per-card-fingerprint repeat-trial blocking once you do collect cards.",
    category: "Subscriptions and lifecycle",
    kind: "example",
  },
  {
    title: "Upgrade $10 to $50 mid-cycle — why is the invoice $30, not $40?",
    body: "Proration math: Stripe credits the unused portion of the old plan and charges the remaining portion of the new one, roughly (days_remaining / days_in_cycle) × price_difference per line item, at second precision. Upgrade with 75% of the cycle left: 0.75 × $50 = $37.50 debit on the new price, 0.75 × $10 = $7.50 credit on the old, net $30 — the customer pays only the upgrade delta for the remaining time, not a full new period. Preview before committing: after staging the price change, fetch the upcoming invoice (invoice preview / preview-lines APIs) to show the user the exact prorated amount and line items. Downgrades work the same in reverse and can leave a customer credit balance that offsets future invoices.",
    category: "Subscriptions and lifecycle",
    kind: "example",
  },
  {
    title: "Is 'inactive' a real Stripe subscription status?",
    body: "No. As of early 2026 the complete status set is exactly seven: trialing, active, incomplete, incomplete_expired, past_due, unpaid, canceled. If a doc, library, or model mentions 'inactive', it is wrong — don't map it. Dangerous transitions to handle deliberately: incomplete → incomplete_expired (about 23 hours without the first payment — the subscription never really started); active/trialing → past_due on failed renewal (dunning running, access decision needed); past_due → unpaid or canceled per your retry settings (revoke access here); anything → canceled is terminal (no un-cancel, you must create a new subscription). Also note paused subscriptions (pause_collection) still report status active — check that field separately. Never blindly overwrite local state on customer.subscription.updated; diff or re-fetch.",
    category: "Subscriptions and lifecycle",
    kind: "fact",
  },
  {
    title: "Duplicate webhook processing double-billed a customer — what's the recovery runbook?",
    body: "Make the customer whole first, then fix the pipe. (1) Refund immediately: refund the duplicate charge with reason: 'duplicate' so it's categorized correctly and doesn't read as a dispute; email the customer proactively before they see the statement. (2) Root-cause: duplicates come from at-least-once webhook delivery hitting a non-idempotent handler, from Dashboard event resends, or from your own retry loops. Check whether your handler itself created the second charge (missing idempotency key) or merely double-provisioned access. (3) Permanent fix: a unique constraint in your database on the Stripe event id (evt_...) so concurrent deliveries can't both process, idempotent handler semantics, and Idempotency-Key headers on any charge-creation calls keyed by order id. (4) Audit: search for other duplicate charges in the same window and refund them too — one visible case usually means more.",
    category: "Webhooks and idempotency",
    kind: "pitfall",
  },
];
