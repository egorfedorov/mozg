"use client";

/**
 * Deleting a brain asks for its title; deleting a note, a source or a token
 * used to be one misclick. A native confirm is enough asymmetry — the server
 * action arrives unchanged as a prop, so this adds the question and nothing
 * else.
 */
export default function ConfirmForm({
  action,
  message,
  style,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  message: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <form
      action={action}
      style={style}
      onSubmit={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
