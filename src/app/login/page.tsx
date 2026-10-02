import type { Metadata } from "next";
import Link from "next/link";
import { TuffoLockup } from "@/components/brand/logo";
import { loginError } from "@/lib/auth/oauth";
import { safeNextPath } from "@/lib/auth/redirects";
import { signupSource } from "@/lib/beta";
import { serverEnv } from "@/lib/env";
import { forecastTown } from "@/lib/forecast/params";
import { LoginForm } from "./login-form";

// Always rendered per request: depends on the session cookie.
export const dynamic = "force-dynamic";
// Room for the wait after a code sign-in (see settleAfterSignIn).
export const maxDuration = 30;

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const failed = loginError(params.error);
  const ref = signupSource(params.ref) ?? "";
  const open = serverEnv.signupsOpen();
  // From the forecast's "Save my pool": name the town.
  const town = forecastTown(next);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-5 py-16">
      <Link href="/" aria-label="Tuffo home" className="self-start">
        <TuffoLockup size={36} />
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{town && open ? `Save your ${town} pool` : "Sign in"}</h1>
        <p className="text-muted">
          {town && open
            ? "Continue with Google, or enter your email for a code and a link. No password. Your forecast settings come with you."
            : open
            ? "New or returning: continue with Google, or enter your email for a code and a link. No password. Free during the beta."
            : "Private beta. Use the Google account or email address you were invited with."}
        </p>
      </div>
      {failed ? (
        <p role="alert" className="rounded-xl border border-chip-warn-fg/40 bg-chip-warn-bg text-chip-warn-fg px-4 py-3 text-sm">
          {failed === "beta"
            ? "Tuffo is in private beta. That Google account's address is not on the list yet. Use the address you were invited with."
            : failed === "google"
              ? "Google sign-in did not finish. Try again, or use your email below."
              : "That link has expired or was already used. Request a new one below."}
        </p>
      ) : null}
      <LoginForm next={next} source={ref} />
      <p className="text-xs text-muted">
        By signing in you agree to the <Link href="/terms" className="underline">terms</Link> and{" "}
        <Link href="/privacy" className="underline">privacy notice</Link>.
      </p>
    </main>
  );
}
