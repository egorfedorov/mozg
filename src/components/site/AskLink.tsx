"use client";

/**
 * A link that opens the chat: the dock listens for this, whatever page it is on.
 */
export default function AskLink({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="linkish"
      onClick={() => {
        window.dispatchEvent(new Event("mozg:chat"));
        document.querySelector<HTMLButtonElement>(".dock-button")?.focus();
      }}
    >
      {label}
    </button>
  );
}
