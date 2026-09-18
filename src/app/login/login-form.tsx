"use client";

import { useActionState } from "react";
import { sendMagicLink, verifyCode, type CodeState, type SignInState } from "./actions";

const initial: SignInState = { status: "idle" };
const initialCode: CodeState = { status: "idle" };

const input =
  "h-12 rounded-xl border border-border bg-surface px-4 text-base text-foreground outline-none placeholder:text-muted/70 focus:border-lagoon focus:ring-2 focus:ring-lagoon/30";
const button =
  "h-12 rounded-xl bg-lagoon px-5 text-base font-semibold text-white transition hover:bg-lagoon-deep disabled:opacity-60";

function CodeForm({ email, next }: { email: string; next: string }) {
  const [state, action, pending] = useActionState(verifyCode, initialCode);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="next" value={next} />
      <label htmlFor="code" className="text-sm font-semibold">
        Or type the code from the email
      </label>
      <div className="flex gap-2">
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={12}
          placeholder="12345678"
          disabled={pending}
          className={`${input} w-48 tracking-[0.25em]`}
        />
        <button type="submit" disabled={pending} className={button}>
          {pending ? "Checking…" : "Sign in"}
        </button>
      </div>
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(sendMagicLink, initial);

  if (state.status === "sent" && state.email) {
    return (
      <div className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">Check your email</h2>
          <p className="text-muted">
            We sent a sign-in email to <span className="font-semibold text-foreground">{state.email}</span>. Tap the
            link on this device, or use the code below. Both expire in an hour.
          </p>
        </div>
        <CodeForm email={state.email} next={next} />
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email" className="text-sm font-semibold">
        Email address
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        autoFocus
        defaultValue={state.email ?? ""}
        placeholder="you@example.com"
        disabled={pending}
        className={input}
      />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      ) : (
        <p className="text-sm text-muted">No password. We email you a link and a code each time.</p>
      )}
    </form>
  );
}
