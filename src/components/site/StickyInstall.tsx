"use client";

import { useEffect, useState } from "react";

/**
 * The one thing to do next, kept in sight: once the pricing has been read and
 * until the install section arrives, a bar along the bottom of the window.
 *
 * It says what is true. The plan is free, and that is the whole of it: no
 * count of places left, no clock. A cross closes it for good, in this browser.
 *
 * Its words come from the page, already in its language: they are on screen
 * from the first scroll, and must not flicker in English first.
 */
export default function StickyInstall({ said, button, close }: { said: string; button: string; close: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let hidden = false;
    try {
      hidden = localStorage.getItem("mozg.bar") === "off";
    } catch {
      /* a private window: the bar comes back next time */
    }
    const pricing = document.getElementById("pricing");
    const install = document.getElementById("install");
    if (hidden || !pricing || !install) return;

    let ticking = false;
    const look = () => {
      ticking = false;
      // Past the top of the pricing, and the install still below the window.
      setShow(pricing.getBoundingClientRect().top < 0 && install.getBoundingClientRect().top > window.innerHeight);
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(look);
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  if (!show) return null;

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem("mozg.bar", "off");
    } catch {
      /* it comes back next time */
    }
  };

  return (
    <div className="bar" role="region" aria-label={button}>
      <span className="bar-mark" aria-hidden="true">
        mozg.
      </span>
      <span className="bar-said">{said}</span>
      <a className="btn bar-go" href="#install">
        {button}
      </a>
      <button type="button" className="bar-close" onClick={dismiss} aria-label={close}>
        ✕
      </button>
    </div>
  );
}
