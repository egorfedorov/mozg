import Billing from "@/components/Billing";
import { prose } from "@/components/Prose";
import { COMPARE, PLANS, type Have, type Plan } from "@/content/pricing";
import { fill, t, type Lang } from "@/lib/i18n";
import { sitePath } from "@/site/paths";

/**
 * The pricing, a section of the landing.
 *
 * Three plans, and a table that says exactly which has what. A feature that
 * is not built is marked planned in both places, and the plans that are not
 * on sale say so on their buttons: a price page is a promise, and this one
 * promises only what exists.
 */
export default function Pricing({ lang }: { lang: Lang }) {
  return (
    <section id="pricing" className="section shell pricing" data-billing="yearly" style={{ scrollMarginTop: 76 }}>
      <div className="section-head">
        <span className="eyebrow">{t("Pricing")}</span>
        <h2 className="h1">{t("Free to start. Free to stay.")}</h2>
        <p className="lede" style={{ marginBottom: 0 }}>
          {t("The plugin has no server of mozg's behind it, so there is nothing to pay for by the month. Pro adds what is marked planned, and does not go on sale before it exists.")}
        </p>
      </div>
      <div className="pricing-bar">
        <Billing yearly={t("A year")} monthly={t("A month")} label={t("Billed")} />
      </div>
      <div className="plans">
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} install={`${sitePath(lang, "/")}#install`} />
        ))}
      </div>
      <div className="table-wrap">
      <table className="compare">
        <caption className="sr-only">{t("What each plan has")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("Feature")}</th>
            {PLANS.map((plan) => (
              <th key={plan.id} scope="col">
                {t(plan.name)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COMPARE.map((row) => (
            <tr key={row.feature}>
              <th scope="row">{prose(t(row.feature))}</th>
              {(["free", "pro", "team"] as const).map((id) => (
                <td key={id}>
                  <Mark have={row[id]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}

function PlanCard({ plan, install }: { plan: Plan; install: string }) {
  return (
    <article className="plan" data-first={plan.id === "free" || undefined} data-sold={plan.sold}>
      {plan.id === "free" && <span className="plan-flag tag">{t("Start here")}</span>}
      <h3 className="plan-name">{t(plan.name)}</h3>
      <p className="plan-who">{t(plan.who)}</p>

      <p className="plan-price num">
        {plan.monthly === null ? (
          <span className="plan-later">{t("Later")}</span>
        ) : plan.monthly === 0 ? (
          <>
            {fill(t("$<0/>"), [0])}
            <span className="plan-unit">{t("forever")}</span>
          </>
        ) : (
          <>
            <span data-when="yearly">
              {fill(t("$<0/>"), [plan.yearly ?? 0])}
              <span className="plan-unit">{t("a year")}</span>
            </span>
            <span data-when="monthly">
              {fill(t("$<0/>"), [plan.monthly ?? 0])}
              <span className="plan-unit">{t("a month")}</span>
            </span>
          </>
        )}
        {plan.perSeat && plan.monthly === null && <span className="plan-unit">{t("per seat")}</span>}
      </p>

      <ul className="plan-features">
        {plan.features.map((feature) => (
          <li key={feature.text} data-planned={feature.planned || undefined}>
            <i aria-hidden="true" />
            <span>{t(feature.text)}</span>
            {feature.planned && <span className="plan-planned">{t("planned")}</span>}
          </li>
        ))}
      </ul>

      {plan.sold === "now" ? (
        <a className="btn btn-plate plan-cta" href={install}>
          {t(plan.cta)}
        </a>
      ) : (
        <span className="btn plan-cta" aria-disabled="true">
          {t(plan.cta)}
        </span>
      )}
      <p className="plan-note">{t(plan.note)}</p>
    </article>
  );
}

/** Included, planned, or not: a mark for the eye and a word for everything else. */
function Mark({ have }: { have: Have }) {
  if (have === true)
    return (
      <span className="have" role="img" aria-label={t("Included")}>
        ■
      </span>
    );
  if (have === "planned")
    // No glyph: the mark is drawn by its style, a square outlined in ink and filled with orange.
    return <span className="have" data-planned role="img" aria-label={t("Planned")} />;
  return (
    <span className="have" data-none role="img" aria-label={t("Not included")}>
      –
    </span>
  );
}
