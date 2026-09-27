import { deleteEntry } from "@/app/app/pools/[id]/actions";
import { ConfirmButton } from "@/components/confirm-button";

export interface ActivityItem {
  id: string;
  kind: "dose" | "event";
  when: string; // formatted
  text: string;
  notes: string | null;
}

/** Recent doses and events, newest first, each removable. */
export function ActivityList({ poolId, items }: { poolId: string; items: ActivityItem[] }) {
  return (
    <section aria-labelledby="activity" className="flex flex-col gap-3">
      <h2 id="activity" className="text-xl font-semibold">
        Doses and events
      </h2>
      <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
        {items.map((item) => (
          <li key={`${item.kind}-${item.id}`} className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm">
                <span className="font-semibold">{item.text}</span>
              </p>
              <p className="text-xs text-muted">
                {item.when}
                {item.notes ? ` · ${item.notes}` : ""}
              </p>
            </div>
            <form action={deleteEntry} className="shrink-0">
              <input type="hidden" name="pool_id" value={poolId} />
              <input type="hidden" name="kind" value={item.kind} />
              <input type="hidden" name="id" value={item.id} />
              <ConfirmButton question={`Remove "${item.text}"?`} label="Remove" />
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
