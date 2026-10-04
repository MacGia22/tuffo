/**
 * Loading skeletons (the loading.tsx files): static blocks in the page's own layout, so
 * nothing jumps when the content arrives. A slow opacity pulse, none with reduced motion.
 * Screen readers hear "Loading…" once.
 */

export function Bone({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-lg bg-border/70 motion-safe:animate-pulse ${className}`} />;
}

/** A card frame in the page's card style. */
export function CardBone({ className = "", children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div aria-hidden="true" className={`flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 ${className}`}>
      {children}
    </div>
  );
}

export function LoadingStatus() {
  return (
    <p role="status" className="sr-only">
      Loading…
    </p>
  );
}
