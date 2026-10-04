"use client";

import { useLinkStatus } from "next/link";
import { useEffect, useRef } from "react";

/**
 * The inside of a Link that shows the tap registered: dimmed while the next page loads,
 * with aria-busy on the link. Must sit inside the Link. `onSettled` runs when a pending
 * navigation ends (a menu closes then).
 */
export function LinkPending({
  className = "",
  onSettled,
  children,
}: {
  className?: string;
  onSettled?: () => void;
  children: React.ReactNode;
}) {
  const { pending } = useLinkStatus();
  const ref = useRef<HTMLSpanElement>(null);
  const was = useRef(false);

  useEffect(() => {
    const link = ref.current?.closest("a");
    if (pending) link?.setAttribute("aria-busy", "true");
    else link?.removeAttribute("aria-busy");
    if (was.current && !pending) onSettled?.();
    was.current = pending;
  }, [pending, onSettled]);

  return (
    <span ref={ref} data-pending={pending ? "" : undefined} className={`transition-opacity ${pending ? "opacity-50" : ""} ${className}`}>
      {children}
    </span>
  );
}
