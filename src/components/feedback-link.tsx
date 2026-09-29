"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { feedbackHref } from "@/lib/feedback";

/** "Send feedback", remembering the page it was clicked on. */
export function FeedbackLink({ className, children = "Send feedback" }: { className?: string; children?: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <Link href={feedbackHref(pathname)} className={className}>
      {children}
    </Link>
  );
}
