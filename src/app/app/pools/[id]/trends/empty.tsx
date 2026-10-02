import Link from "next/link";
import { fromParam } from "@/lib/return-to";

/** Trends with fewer than 2 free chlorine tests: no line to draw yet. */
export function TrendsEmpty({ base, fcTests }: { base: string; fcTests: number }) {
  return (
    <section aria-labelledby="empty" className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border-input p-6">
      <h2 id="empty" className="text-xl font-semibold">
        Log 2 tests to see your chlorine line
      </h2>
      <p className="max-w-lg text-muted">
        {fcTests === 1
          ? "One more free chlorine test and Tuffo draws the line between them, with the sun and rain in between."
          : "With two free chlorine tests Tuffo draws the line between them, with the sun and rain in between."}
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href={`${base}/readings/new?${fromParam(`${base}/trends`)}`}
          className="inline-flex min-h-11 items-center rounded-xl bg-action px-4 text-sm font-semibold text-white hover:bg-action-deep"
        >
          Log a test
        </Link>
        <Link
          href={`${base}/import`}
          className="inline-flex min-h-11 items-center rounded-xl border border-lagoon px-4 text-sm font-semibold text-lagoon hover:bg-lagoon/10"
        >
          Import from Pool Math
        </Link>
      </div>
    </section>
  );
}
