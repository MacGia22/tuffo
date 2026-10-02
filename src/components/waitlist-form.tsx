"use client";

import { useState, type FormEvent } from "react";

type Status = "idle" | "sending" | "done" | "closed" | "error";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
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
        // The ?ref= of the link that brought the visitor (e.g. tuffo.app/?ref=pools); the server checks it.
        body: JSON.stringify({ email, website, source: new URLSearchParams(window.location.search).get("ref") }),
      });
      const data = (await response.json()) as { ok?: boolean; message?: string };
      if (response.status === 503 || response.status === 429) {
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
    <form onSubmit={onSubmit} className="relative flex w-full max-w-md flex-col gap-3 sm:flex-row">
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
        className="h-12 flex-1 rounded-xl border border-border-input bg-surface px-4 text-base text-foreground outline-none placeholder:text-muted/70 focus:border-lagoon focus:ring-2 focus:ring-lagoon/30"
      />
      {/* Left empty by people (it is off-screen and skipped by keyboard and screen readers); bots fill it. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={website}
        onChange={(event) => setWebsite(event.target.value)}
        className="absolute -left-[9999px] h-px w-px opacity-0"
      />
      <button
        type="submit"
        disabled={status === "sending" || status === "done"}
        className="h-12 rounded-xl bg-action px-5 text-base font-semibold text-white transition hover:bg-action-deep disabled:opacity-60"
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
