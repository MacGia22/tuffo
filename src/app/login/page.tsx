import type { Metadata } from "next";
import Link from "next/link";
import { TuffoLockup } from "@/components/brand/logo";
import { safeNextPath } from "@/lib/auth/redirects";
import { LoginForm } from "./login-form";

// Always rendered per request: depends on the session cookie.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const failed = params.error === "link";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-5 py-16">
      <Link href="/" aria-label="Tuffo home" className="self-start">
        <TuffoLockup size={36} />
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Sign in</h1>
        <p className="text-muted">Private beta. Use the address you were invited with.</p>
      </div>
      {failed ? (
        <p role="alert" className="rounded-xl border border-sun/60 bg-sun/10 px-4 py-3 text-sm">
          That link has expired or was already used. Request a new one below.
        </p>
      ) : null}
      <LoginForm next={next} />
      <p className="text-xs text-muted">
        By signing in you agree to the <Link href="/terms" className="underline">terms</Link> and{" "}
        <Link href="/privacy" className="underline">privacy notice</Link>.
      </p>
    </main>
  );
}
