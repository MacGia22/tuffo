import Link from "next/link";
import type { Advice, Recommendation, Severity } from "@/lib/advice";
import { catalogProduct } from "@/lib/catalog";
import { baseToShelf, formatShelf } from "@/lib/dose-format";
import type { Units } from "@/lib/format";

const TONE: Record<Severity, string> = {
  act: "border-sun/70 bg-sun/10",
  watch: "border-ice bg-ice/15",
  ok: "border-border bg-surface",
};

const BADGE: Record<Severity, string> = {
  act: "bg-sun text-navy",
  watch: "bg-ice text-navy",
  ok: "bg-lagoon/10 text-lagoon",
};

const BADGE_TEXT: Record<Severity, string> = { act: "Add", watch: "Watch", ok: "Fine" };

function DoseLine({ item, units, poolId }: { item: Recommendation; units: Units; poolId: string }) {
  if (!item.dose || item.dose.amount <= 0) return null;
  const name = catalogProduct(item.dose.productId)?.short ?? item.dose.productId;
  const shelf = baseToShelf(item.dose.amount, item.dose.unit, units);
  if (shelf.value <= 0) return null;
  const logHref = `/app/pools/${poolId}/doses/new?${new URLSearchParams({
    product: item.dose.productId,
    amount: String(shelf.value),
    unit: shelf.unit,
  })}`;
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
      <p className="font-display text-lg font-semibold">
        Add {formatShelf(shelf.value, shelf.unit)} of {name}
      </p>
      <Link
        href={logHref}
        className="rounded-lg border border-lagoon px-3 py-1.5 text-sm font-semibold text-lagoon hover:bg-lagoon/10"
      >
        I added it
      </Link>
    </div>
  );
}

export function AdvicePanel({ advice, units, poolId }: { advice: Advice; units: Units; poolId: string }) {
  return (
    <section aria-labelledby="advice" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="advice" className="text-xl font-semibold">
          What to do now
        </h2>
        <p className="text-sm text-muted">Based on the latest test. Tuffo advises; you decide.</p>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {advice.items.map((item) => (
          <li key={item.measure} className={`rounded-2xl border p-4 ${TONE[item.severity]}`}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-sans text-base font-semibold">{item.title}</h3>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[item.severity]}`}>
                {BADGE_TEXT[item.severity]}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted">{item.detail}</p>
            <DoseLine item={item} units={units} poolId={poolId} />
            {item.dose?.notes.length ? (
              <ul className="mt-2 list-disc pl-5 text-xs text-muted">
                {item.dose.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
      {advice.assumptions.length > 0 ? (
        <ul className="list-disc pl-5 text-xs text-muted">
          {advice.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted">
        Everyday targets for this pool: FC {advice.targets.fc.targetLow}–{advice.targets.fc.targetHigh} ppm (never
        below {advice.targets.fc.min}), pH {advice.targets.ph.low}–{advice.targets.ph.high}, TA{" "}
        {advice.targets.ta.low}–{advice.targets.ta.high}, CH {advice.targets.ch.low}–{advice.targets.ch.high}, CYA{" "}
        {advice.targets.cya.low}–{advice.targets.cya.high}
        {advice.targets.salt ? `, salt ${advice.targets.salt.low}–${advice.targets.salt.high}` : ""}.
      </p>
    </section>
  );
}
