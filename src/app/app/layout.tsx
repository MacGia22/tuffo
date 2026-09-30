import type { Metadata } from "next";
import Link from "next/link";
import { TuffoLockup } from "@/components/brand/logo";
import { FeedbackLink } from "@/components/feedback-link";
import { InstallBanner } from "@/components/install-banner";
import { OfflineSync } from "@/components/offline-sync";
import { isAdmin } from "@/lib/auth/admin";
import { requireUser } from "@/lib/auth/user";

// Always rendered per request: depends on the session cookie.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your pools",
  robots: { index: false },
};

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await requireUser("/app");

  return (
    <>
      <header className="border-b border-border bg-surface/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-3">
          <Link href="/app" aria-label="Your pools">
            <TuffoLockup size={32} />
          </Link>
          <div className="flex items-center gap-4 text-sm">
            {isAdmin(user) ? (
              <Link href="/app/admin" className="text-muted hover:text-foreground">
                Admin
              </Link>
            ) : null}
            <Link href="/app/account" className="text-muted hover:text-foreground" title={user.email ?? ""}>
              Account
            </Link>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-lg border border-border px-3 py-1.5 font-semibold text-muted hover:text-foreground"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-8">
        <OfflineSync userId={user.id} />
        <InstallBanner />
        {children}
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-5 gap-y-2 px-5 py-5 text-xs text-muted">
          <p>
            Weather data by{" "}
            <a href="https://open-meteo.com/" className="underline underline-offset-2 hover:text-foreground">
              Open-Meteo.com
            </a>{" "}
            (CC BY 4.0)
          </p>
          <nav className="flex gap-4">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <FeedbackLink className="hover:text-foreground" />
          </nav>
        </div>
      </footer>
    </>
  );
}
