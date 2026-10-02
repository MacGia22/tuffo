import Link from "next/link";
import { fromParam } from "@/lib/return-to";

export interface ActivityItem {
  id: string;
  kind: "dose" | "event";
  when: string; // formatted
  text: string;
  notes: string | null;
}

/** Recent doses and events, newest first. A row opens its edit screen, where Remove is. */
export function ActivityList({ poolId, items }: { poolId: string; items: ActivityItem[] }) {
  const back = fromParam(`/app/pools/${poolId}#activity`);
  return (
    <section aria-labelledby="activity" className="flex flex-col gap-3">
      <h2 id="activity" className="text-xl font-semibold">
        Doses and events
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {items.map((item) => (
          <li key={`${item.kind}-${item.id}`}>
            <Link
              href={`/app/pools/${poolId}/${item.kind === "dose" ? "doses" : "events"}/${item.id}/edit?${back}`}
              aria-label={`${item.text}, ${item.when}. Edit or remove`}
              className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 hover:bg-lagoon/5 focus-visible:bg-lagoon/5 focus-visible:-outline-offset-2"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{item.text}</span>
                <span className="block text-xs text-muted">
                  {item.when}
                  {item.notes ? ` · ${item.notes}` : ""}
                </span>
              </span>
              <span aria-hidden="true" className="shrink-0 text-lg text-muted">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
