import { baseToShelf, formatShelf } from "@/lib/dose-format";
import type { Units } from "@/lib/format";
import type { StoredPlanDay } from "@/lib/plan/stored";

/** "1 qt", or null when there is nothing to add. */
export function planAddLabel(day: Pick<StoredPlanDay, "addMl">, units: Units): string | null {
  if (!(day.addMl > 0)) return null;
  const shelf = baseToShelf(day.addMl, "mL", units);
  return shelf.value > 0 ? formatShelf(shelf.value, shelf.unit) : null;
}
