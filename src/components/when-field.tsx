"use client";

import { useState } from "react";

const input =
  "h-11 w-full min-w-0 rounded-xl border border-border-input bg-surface px-3 text-base text-foreground outline-none focus:border-lagoon focus:ring-2 focus:ring-lagoon/30";
const link = "font-semibold text-lagoon underline-offset-2 hover:underline";

/** The browser's current local time as a datetime-local value: "2026-10-01T09:30". */
function localNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * When something happened: "Now · Change" until the owner picks a time. An empty value
 * means now (the server stamps it). Editing always shows the field. Controlled when
 * `value` is given (the reading form fills it from a scan), otherwise it keeps its own.
 */
export function WhenField({
  id,
  name,
  edit = false,
  value,
  defaultValue = "",
  onChange,
}: {
  id: string;
  name: string;
  edit?: boolean;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
}) {
  const [inner, setInner] = useState(defaultValue);
  const [changing, setChanging] = useState(false);
  const current = value ?? inner;
  const set = (next: string) => {
    if (value === undefined) setInner(next);
    onChange?.(next);
  };

  if (!edit && !changing && current === "") {
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-semibold">When</span>
        <input type="hidden" name={name} value="" />
        <p className="flex h-11 items-center gap-2 text-base">
          <span>Now</span>
          <span aria-hidden="true" className="text-muted">
            ·
          </span>
          <button
            type="button"
            onClick={() => {
              set(localNow());
              setChanging(true);
            }}
            className={link}
            aria-label="Change when"
          >
            Change
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        When <span className="font-normal text-muted">(time at the pool)</span>
      </label>
      <div className="flex min-w-0 items-center gap-3">
        <input
          id={id}
          name={name}
          type="datetime-local"
          value={current}
          autoFocus={changing}
          onChange={(e) => set(e.target.value)}
          className={input}
        />
        {edit ? null : (
          <button
            type="button"
            onClick={() => {
              set("");
              setChanging(false);
            }}
            className={`${link} shrink-0 text-sm`}
          >
            Now
          </button>
        )}
      </div>
    </div>
  );
}
