"use client";

import { useState } from "react";
import { useT } from "@/lib/t-client";
import { markup } from "@/lib/markup";
import { formatCents, commissionCents, REFERRAL_PERCENT } from "@/lib/money-math";

/**
 * What this is actually worth to you, with your own numbers in it.
 *
 * A percentage is a claim and a slider is an answer. The arithmetic is small
 * enough to do in the head — it is here because nobody does, and because
 * moving the handle is the moment the recurring part stops being a word.
 *
 * Every number it prints is a real one: the plan prices are the prices, the
 * percentage is the percentage, and the year figure says out loud that it
 * assumes nobody leaves. A calculator that quietly assumes perfect retention
 * and does not admit it is a lie with a slider on it.
 */
export default function Calculator({
  plans,
}: {
  plans: { key: string; label: string; priceCents: number }[];
}) {
  const t = useT();

  const [planKey, setPlanKey] = useState(plans[0]?.key);
  const [count, setCount] = useState(10);

  const plan = plans.find((p) => p.key === planKey) ?? plans[0];
  const perReferral = commissionCents(plan.priceCents);
  const monthly = perReferral * count;

  return (
    <div
      style={{
        border: "1.5px solid var(--ink)",
        background: "var(--paper-2)",
        boxShadow: "6px 6px 0 var(--ink)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
          padding: "1rem 1.25rem",
          borderBottom: "1.5px solid var(--ink)",
        }}
      >
        <p className="eyebrow" style={{ margin: 0 }}>
          {t("What it comes to")}
        </p>
        <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>
          {`${REFERRAL_PERCENT}% · ${t("real prices · move the handle")}`}
        </span>
      </div>

      <div style={{ padding: "1.25rem", display: "grid", gap: "1.5rem" }}>
        <div>
          <p className="eyebrow" style={{ margin: "0 0 .5rem" }}>
            {t("The plan they buy")}
          </p>
          <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
            {plans.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPlanKey(p.key)}
                className="mono"
                aria-pressed={p.key === planKey}
                style={{
                  cursor: "pointer",
                  fontSize: ".8125rem",
                  padding: ".45rem .8rem",
                  border: "1.5px solid var(--ink)",
                  background: p.key === planKey ? "var(--color-riso-yellow)" : "transparent",
                  color: "var(--ink)",
                }}
              >
                {t(p.label)} · {formatCents(p.priceCents)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "1rem",
            }}
          >
            <p className="eyebrow" style={{ margin: "0 0 .5rem" }}>
              {t("People still paying")}
            </p>
            <strong className="mono" style={{ fontSize: "1rem" }}>
              {count}
            </strong>
          </div>
          <input
            className="earn-slider"
            type="range"
            min={1}
            max={50}
            value={count}
            aria-label={t("How many referrals are still subscribed")}
            onChange={(e) => setCount(Number(e.target.value))}
          />
          <div
            className="mono"
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: ".6875rem",
              color: "var(--ink-3)",
            }}
          >
            <span>1</span>
            <span>50</span>
          </div>
        </div>

        <div className="stats">
          <div className="stat">
            <span className="eyebrow">{t("Every month")}</span>
            <span className="stat-value" data-big="true" style={{ color: "var(--color-riso-green)" }}>
              {formatCents(monthly)}
            </span>
            <span className="stat-note">
              {markup(t("<0/> per person, per month"), [formatCents(perReferral)])}
            </span>
          </div>
          <div className="stat">
            <span className="eyebrow">{t("Over a year")}</span>
            <span className="stat-value" data-big="true">
              {formatCents(monthly * 12)}
            </span>
            <span className="stat-note">{t("if none of them cancel — they will, some of them")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
