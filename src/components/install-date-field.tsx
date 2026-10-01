"use client";

import { useState } from "react";
import { ABOUT_YEARS } from "@/lib/maintenance";

const field = "h-10 rounded-xl border border-border bg-background px-3 text-sm";
const label = "flex flex-col gap-1 text-xs text-muted";

/**
 * When a piece of equipment was installed: a day, or "Not sure" with "about N years ago".
 * Sends `since` (a day) or `since_years`; the server works out the date.
 */
export function InstallDateField({
  defaultValue = "",
  hint,
}: {
  defaultValue?: string;
  /** Shown after "Installed on", e.g. "(empty = today)". */
  hint?: string;
}) {
  const [unsure, setUnsure] = useState(false);
  return (
    <div className="flex flex-wrap items-end gap-2">
      {unsure ? (
        <label className={label}>
          Installed
          <select name="since_years" defaultValue="5" className={field}>
            {ABOUT_YEARS.map((y) => (
              <option key={y} value={y}>
                about {y} {y === 1 ? "year" : "years"} ago
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className={label}>
          Installed on{hint ? ` ${hint}` : ""}
          <input type="date" name="since" defaultValue={defaultValue} className={`${field} w-44`} />
        </label>
      )}
      <button
        type="button"
        onClick={() => setUnsure((u) => !u)}
        className="h-10 text-sm font-semibold text-lagoon underline-offset-2 hover:underline"
      >
        {unsure ? "Pick a day" : "Not sure?"}
      </button>
    </div>
  );
}
