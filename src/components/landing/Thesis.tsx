"use client";

import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { t } from "@/lib/i18n";

/**
 * The thesis, one word at a time.
 *
 * Without JavaScript, and for anyone who asked their system not to animate,
 * the sentence is simply there. Only where motion is welcome does the page
 * wait for the reader to reach it and then let the words arrive in order: one
 * slow reveal, nothing bounces.
 */
export default function Thesis() {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    setReady(true);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setOn(true);
          observer.disconnect();
        }
      },
      { threshold: 0.55 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const line = (text: string, accent: boolean, offset: number): ReactNode => (
    <p className="thesis-line" data-accent={accent || undefined}>
      {text.split(" ").map((word, i) => (
        // The space is outside the box: a trailing space inside an inline-block
        // is trimmed, and the words print as one word.
        <Fragment key={`${offset}-${i}`}>
          <span className="thesis-word" data-on={on || undefined} style={{ "--i": String(offset + i) } as CSSProperties}>
            {word}
          </span>{" "}
        </Fragment>
      ))}
    </p>
  );

  return (
    <div ref={ref} data-ready={ready || undefined}>
      {line(t("Code got cheap."), false, 0)}
      {line(t("Understanding didn't."), true, 3)}
    </div>
  );
}
