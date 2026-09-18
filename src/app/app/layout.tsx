import type { Metadata } from "next";
import Link from "next/link";
import { TuffoLockup } from "@/components/brand/logo";
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
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-8">{children}</main>
    </>
  );
}
