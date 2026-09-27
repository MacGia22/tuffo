import type { ReactNode } from "react";
import Link from "next/link";
import { TuffoLockup } from "@/components/brand/logo";

/** Shared frame for the privacy notice and the terms: logo, title, date, readable measure. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  /** "September 27, 2026" */
  updated: string;
  children: ReactNode;
}) {
  return (
    <>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-12">
        <Link href="/" aria-label="Tuffo home" className="self-start">
          <TuffoLockup size={32} />
        </Link>
        <h1 className="mt-10 text-4xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {updated}</p>
        <div
          className={[
            "mt-8 flex flex-col gap-4 text-base leading-7 text-foreground",
            "[&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold",
            "[&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold",
            "[&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-6",
            "[&_a]:text-lagoon [&_a]:underline [&_a]:underline-offset-4",
            "[&_strong]:font-semibold",
          ].join(" ")}
        >
          {children}
        </div>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap gap-x-5 gap-y-2 px-5 py-6 text-sm text-muted">
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <a href="mailto:hello@tuffo.app" className="hover:text-foreground">
            hello@tuffo.app
          </a>
        </div>
      </footer>
    </>
  );
}
