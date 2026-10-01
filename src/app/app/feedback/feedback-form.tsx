"use client";

import { BackButton } from "@/components/back-button";

import { useActionState, useState } from "react";
import { FEEDBACK_KINDS, FEEDBACK_MAX_CHARS, KIND_LABELS, messageLength } from "@/lib/feedback";
import { sendFeedback, type FeedbackState } from "./actions";

const initial: FeedbackState = {};

const HINTS: Record<(typeof FEEDBACK_KINDS)[number], string> = {
  idea: "Something Tuffo could do",
  problem: "Something wrong or confusing",
  question: "Something you want to know",
  other: "Anything else",
};

export function FeedbackForm({ page }: { page: string | null }) {
  const [state, action, pending] = useActionState(sendFeedback, initial);
  return (
    <>
      {state.sentAt ? (
        <p role="status" className="rounded-xl bg-lagoon/10 px-4 py-3 text-sm">
          Thanks, it is in. You can follow what happens to it below.
        </p>
      ) : null}
      {/* A new key after each send clears the form. */}
      <Fields key={state.sentAt ?? 0} state={state} action={action} pending={pending} page={page} />
    </>
  );
}

function Fields({
  state,
  action,
  pending,
  page,
}: {
  state: FeedbackState;
  action: (formData: FormData) => void;
  pending: boolean;
  page: string | null;
}) {
  const [message, setMessage] = useState(state.fields?.message ?? "");
  const length = messageLength(message);
  const over = length > FEEDBACK_MAX_CHARS;
  const kind = state.fields?.kind ?? "idea";

  return (
    <form action={action} className="flex flex-col gap-4">
      {page ? <input type="hidden" name="page" value={page} /> : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">What is it?</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FEEDBACK_KINDS.map((k) => (
            <label
              key={k}
              className="flex cursor-pointer flex-col rounded-xl border border-border bg-background px-3 py-2 text-sm has-[:checked]:border-lagoon has-[:checked]:ring-2 has-[:checked]:ring-lagoon/30"
            >
              <span className="flex items-center gap-2 font-semibold">
                <input type="radio" name="kind" value={k} defaultChecked={k === kind} className="accent-lagoon" />
                {KIND_LABELS[k]}
              </span>
              <span className="text-xs text-muted">{HINTS[k]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="feedback-message" className="text-sm font-semibold">
          Message
        </label>
        <textarea
          id="feedback-message"
          name="message"
          required
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-describedby="feedback-count"
          className="rounded-xl border border-border bg-background px-3 py-2 text-base outline-none focus:border-lagoon focus:ring-2 focus:ring-lagoon/30"
        />
        <p id="feedback-count" className={`self-end text-xs tabular-nums ${over ? "text-red-600" : "text-muted"}`}>
          {length} / {FEEDBACK_MAX_CHARS} characters
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="contact_ok"
          defaultChecked={state.fields?.contact_ok === "on"}
          className="accent-lagoon"
        />
        OK to email me about this
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || over || message.trim() === ""}
          className="h-11 rounded-xl bg-lagoon px-5 text-sm font-semibold text-white hover:bg-lagoon-deep disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send"}
        </button>
        <BackButton fallback="/app" />
        {state.error ? (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
