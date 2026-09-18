"use client";

import { useState, type FormEvent } from "react";

type Status = "idle" | "sending" | "done" | "closed" | "error";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as { ok?: boolean; message?: string };
      if (response.status === 503) {
        setStatus("closed");
        setMessage(data.message ?? "The waitlist opens with the beta.");
        return;
      }
      if (!response.ok || !data.ok) {
        setStatus("error");
        setMessage(data.message ?? "That did not go through. Try again in a moment.");
        return;
      }
      setStatus("done");
      setMessage("You are on the list. We will write when the beta opens.");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("That did not go through. Try again in a moment.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
      <label className="sr-only" htmlFor="waitlist-email">
        Email address
      </label>
      <input
        id="waitlist-email"
        type="email"
        name="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={status === "sending" || status === "done"}
        className="h-12 flex-1 rounded-xl border border-border bg-surface px-4 text-base text-foreground outline-none placeholder:text-muted/70 focus:border-lagoon focus:ring-2 focus:ring-lagoon/30"
      />
      <button
        type="submit"
        disabled={status === "sending" || status === "done"}
        className="h-12 rounded-xl bg-lagoon px-5 text-base font-semibold text-white transition hover:bg-lagoon-deep disabled:opacity-60"
      >
        {status === "sending" ? "Sending…" : "Join the beta list"}
      </button>
      {message ? (
        <p
          role="status"
          className={`basis-full text-sm ${status === "error" ? "text-red-600" : "text-muted"}`}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
