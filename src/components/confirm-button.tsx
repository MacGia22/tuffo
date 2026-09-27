"use client";

import { useFormStatus } from "react-dom";

/** A submit button that asks before a destructive action. */
export function ConfirmButton({
  question,
  label,
  className,
}: {
  question: string;
  label: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={label}
      title={label}
      onClick={(e) => {
        if (!window.confirm(question)) e.preventDefault();
      }}
      className={className ?? "rounded-md px-2 py-1 text-xs font-semibold text-muted hover:bg-red-50 hover:text-red-700 disabled:opacity-50"}
    >
      {pending ? "…" : "Remove"}
    </button>
  );
}
