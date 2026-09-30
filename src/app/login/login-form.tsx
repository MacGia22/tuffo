"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { sendMagicLink, signInWithGoogle, verifyCode, type CodeState, type SignInState } from "./actions";

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

/** Google's "G" mark, as its sign-in branding guidelines ask for. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function GoogleButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-12 items-center justify-center gap-3 rounded-xl border border-border bg-surface px-5 text-base font-semibold text-foreground transition hover:border-lagoon disabled:opacity-60"
    >
      <GoogleMark />
      {pending ? "Opening Google…" : "Continue with Google"}
    </button>
  );
}

export function LoginForm({ next, source }: { next: string; source: string }) {
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
    <div className="flex flex-col gap-5">
      <form action={signInWithGoogle} className="flex flex-col">
        <input type="hidden" name="next" value={next} />
        <GoogleButton />
      </form>
      <p className="flex items-center gap-3 text-xs text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        or with your email
        <span className="h-px flex-1 bg-border" />
      </p>
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="ref" value={source} />
        <label htmlFor="email" className="text-sm font-semibold">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
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
    </div>
  );
}
