import type { Metadata } from "next";
import { Unbounded, Golos_Text, JetBrains_Mono } from "next/font/google";
import { env } from "@/lib/env";
import "./globals.css";

// Cyrillic throughout: brains will hold Russian notes, and a fallback glyph in
// a note title is the fastest way to make a product feel unfinished.
const display = Unbounded({
  subsets: ["latin", "cyrillic"],
  weight: ["700", "800"],
  variable: "--font-display",
  display: "swap",
});

const body = Golos_Text({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  // Absolute URLs for every og:/twitter: tag below — without a base, crawlers
  // get relative paths and the share card silently loses its image.
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: "mozg — one brain, every agent",
  description:
    "Build a knowledge brain from screenshots and files, then connect it to Claude Code, Codex and Cursor over MCP.",
  openGraph: {
    siteName: "mozg",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      {/* No footer here on purpose: it belongs to the public side of the site.
          A workspace ends in work, not in a wall of links out. */}
      <body>{children}</body>
    </html>
  );
}
