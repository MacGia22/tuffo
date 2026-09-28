"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/** Last-resort screen when the root layout itself fails; reports the error first. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "3rem 1.25rem", color: "#0B2E4F" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ marginTop: "0.75rem" }}>Tuffo hit an error and could not show this page. Your data is safe.</p>
        <button
          type="button"
          onClick={reset}
          style={{ marginTop: "1.5rem", padding: "0.6rem 1.2rem", background: "#0E7C9E", color: "white", borderRadius: 8 }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
