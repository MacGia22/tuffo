"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { LinkPending } from "@/components/link-pending";

const menuItem =
  "block w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold hover:bg-lagoon/10 focus:bg-lagoon/10";

/** The current page with its query, for `?from=`. */
export function useCurrentPath(): string {
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}

/**
 * A button that opens a short menu. Closes on Escape (focus back on the button), on a
 * click outside and once a chosen item's page has loaded (the item dims meanwhile, so
 * the tap shows it registered). `placement` sets where the menu opens.
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
  /** Links, or a POST form (e.g. sign out) when `post` is set. */
  items: { href: string; label: string; post?: boolean }[];
  placement?: "below" | "below-end" | "above";
  children: React.ReactNode;
}) {
  // Open on the page it was opened on: a chosen link stays on screen (dimmed) until its
  // page arrives, and the menu is closed there.
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  if (openOn !== null && openOn !== pathname) setOpenOn(null);
  const open = openOn === pathname;
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const close = useCallback(() => setOpenOn(null), []);

  // Keep the open menu inside the screen: shift it back when it would overflow an edge.
  useLayoutEffect(() => {
    const el = list.current;
    if (!open || !el) return;
    el.style.transform = "";
    const rect = el.getBoundingClientRect();
    const gap = 8;
    let shift = 0;
    if (rect.left < gap) shift = gap - rect.left;
    else if (rect.right > window.innerWidth - gap) shift = window.innerWidth - gap - rect.right;
    el.style.transform = shift ? `translateX(${shift}px)` : "";
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpenOn(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenOn(null);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    // First item gets focus so the menu works from the keyboard.
    root.current?.querySelector<HTMLElement>("[data-menu-item]")?.focus();
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
        onClick={() => setOpenOn(open ? null : pathname)}
        className={buttonClassName}
      >
        {children}
      </button>
      {open ? (
        <ul
          ref={list}
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
              {item.post ? (
                <form action={item.href} method="post">
                  <button type="submit" data-menu-item className={menuItem}>
                    {item.label}
                  </button>
                </form>
              ) : (
                <Link href={item.href} data-menu-item className={menuItem}>
                  <LinkPending onSettled={close}>{item.label}</LinkPending>
                </Link>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
