import { VOICES } from "@/content/voices";

/**
 * The people who have said something about mozg, in their words, with their
 * faces. It shows nothing until there is something true to show: see
 * src/content/voices.ts.
 */
export default function Voices() {
  if (!VOICES.length) return null;
  return (
    <ul className="voices" aria-label="mozg">
      {VOICES.map((voice) => (
        <li key={voice.avatar} className="voice">
          {/* A fixed-size local portrait: next/image adds a loader for an image that never changes size. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={voice.avatar} alt="" width={40} height={40} loading="lazy" />
          <blockquote>
            <p>{voice.text}</p>
            <cite>{voice.who}</cite>
          </blockquote>
        </li>
      ))}
    </ul>
  );
}
