"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * "Start free" button to the sign-in page, carrying the ?ref= of the link that brought
 * the visitor (e.g. tuffo.app/?ref=pools) so a new account can record it. The page
 * stays static; the label is read in the browser on click and checked again on the
 * server.
 */
export function StartFreeLink({ className, children }: { className: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <Link
      href="/login"
      className={className}
      onClick={(event) => {
        const ref = new URLSearchParams(window.location.search).get("ref");
        if (!ref || event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        router.push(`/login?ref=${encodeURIComponent(ref)}`);
      }}
    >
      {children}
    </Link>
  );
}
