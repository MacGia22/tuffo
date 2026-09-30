"use client";

import { useEffect } from "react";

/**
 * Asks the service worker to keep a copy of the log forms for this pool, so they open
 * without a connection even if the person never visited them. Only when a service
 * worker controls the page and the connection is not metered.
 */
export function WarmOffline({ urls }: { urls: string[] }) {
  const key = urls.join("|");
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;
    const timer = window.setTimeout(() => {
      for (const url of key.split("|")) {
        void fetch(url, { headers: { "x-tuffo-warm": "1" }, credentials: "same-origin" }).catch(() => undefined);
      }
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [key]);
  return null;
}
