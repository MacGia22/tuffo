"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { fromParam } from "@/lib/return-to";

/** The four ways to log something for a pool, each returning to the current page. */
export function logLinks(poolId: string, current: string) {
  const from = fromParam(current);
  const base = `/app/pools/${poolId}`;
  return [
    { href: `${base}/readings/new?${from}`, label: "Log a test" },
    { href: `${base}/doses/new?${from}`, label: "Log a dose" },
    { href: `${base}/events/new?${from}`, label: "Log an event" },
    { href: `${base}/readings/new?${from}#scan`, label: "Scan a test" },
  ];
}

/** The current page with its query, for `?from=`. */
export function useCurrentPath(): string {
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}

/**
 * A button that opens a short menu. Closes on Escape (focus back on the button), on a
 * click outside and when an item is chosen. `placement` sets where the menu opens.
 */
export function MenuButton({
  label,
  buttonClassName,
  items,
  placement = "below",
  children,
}: {
  label: string;
  buttonClassName: string;
  items: { href: string; label: string }[];
  placement?: "below" | "below-end" | "above";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    // First item gets focus so the menu works from the keyboard.
    root.current?.querySelector<HTMLAnchorElement>("[data-menu-item]")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className={buttonClassName}
      >
        {children}
      </button>
      {open ? (
        <ul
          id={id}
          className={`absolute z-40 flex min-w-48 flex-col rounded-xl border border-border bg-surface p-1 shadow-lg ${
            placement === "above"
              ? "bottom-full right-1/2 mb-2 translate-x-1/2"
              : placement === "below-end"
                ? "right-0 top-full mt-2"
                : "left-0 top-full mt-2"
          }`}
        >
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                data-menu-item
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-lagoon/10 focus:bg-lagoon/10 focus:outline-none"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
