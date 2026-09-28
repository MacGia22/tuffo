import type { Units } from "@/lib/format";
import type { ChlorineUse as Use } from "@/lib/model/usage";

function span(days: number | null): string {
  if (days === null) return "";
  if (days < 14) {
    const d = Math.max(1, Math.round(days));
    return ` over ${d} ${d === 1 ? "day" : "days"}`;
  }
  const weeks = Math.round(days / 7);
  return ` over ${weeks} weeks`;
}

export function ChlorineUse({ use, units, swg }: { use: Use; units: Units; swg: boolean }) {
  const day = units === "us" ? "90 °F" : "32 °C";
  return (
    <section aria-labelledby="chlorine-use" className="rounded-2xl border border-border bg-surface p-5">
      <h2 id="chlorine-use" className="text-xl font-semibold">
        Your pool&apos;s chlorine use
      </h2>
      <p className="mt-2">
        Your pool uses about <strong className="font-display text-lg">{use.sunnyDayPpm.toFixed(1)} ppm</strong> of free
        chlorine a day on a sunny, {day} day{swg ? ", which the salt cell has to make" : ""}.
      </p>
      <p className="mt-1 text-sm text-muted">
        Learned from {use.pairs} test pairs{span(use.spanDays)}, with the weather at your pool.
        {use.cyaAssumed ? " It assumes 40 ppm stabilizer until you test for it." : ""} Tuffo advises; you decide.
      </p>
    </section>
  );
}
