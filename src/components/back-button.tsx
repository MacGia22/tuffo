"use client";

import { useRouter } from "next/navigation";

/** Cancel for a page reached from anywhere: back one step, or to `fallback` with no history. */
export function BackButton({
  fallback,
  label = "Cancel",
  className = "inline-flex h-11 items-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold hover:border-lagoon",
}: {
  fallback: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
    >
      {label}
    </button>
  );
}
