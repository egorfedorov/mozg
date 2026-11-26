"use client";

import { useState } from "react";

/**
 * Yearly or monthly. The only moving part of the pricing, and it moves one
 * attribute on the section: both prices are on the page from the start, and
 * the stylesheet shows the one that was chosen.
 */
export default function Billing({ yearly, monthly, label }: { yearly: string; monthly: string; label: string }) {
  const [when, setWhen] = useState<"yearly" | "monthly">("yearly");
  const choose = (next: "yearly" | "monthly") => {
    setWhen(next);
    document.getElementById("pricing")?.setAttribute("data-billing", next);
  };
  return (
    <div className="seg" role="group" aria-label={label}>
      <button type="button" className="seg-opt" aria-pressed={when === "yearly"} onClick={() => choose("yearly")}>
        {yearly}
      </button>
      <button type="button" className="seg-opt" aria-pressed={when === "monthly"} onClick={() => choose("monthly")}>
        {monthly}
      </button>
    </div>
  );
}
