"use client";

import { useSyncExternalStore } from "react";
import { unitsForBrowser } from "@/lib/browser-units";
import type { Units } from "@/lib/format";

const subscribe = () => () => {};

function fromBrowser(): Units {
  let timeZone: string | undefined;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timeZone = undefined;
  }
  return unitsForBrowser({ timeZone, language: navigator.language });
}

/** The browser's likely units (see unitsForBrowser); "us" on the server and while hydrating. */
export function useBrowserUnits(): Units {
  return useSyncExternalStore(subscribe, fromBrowser, () => "us");
}
