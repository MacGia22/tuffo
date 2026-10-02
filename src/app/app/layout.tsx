import type { Metadata } from "next";
import Link from "next/link";
import { TuffoLockup } from "@/components/brand/logo";
import { FeedbackLink } from "@/components/feedback-link";
import { InstallBanner } from "@/components/install-banner";
import { OfflineSync } from "@/components/offline-sync";
import { isAdmin } from "@/lib/auth/admin";
import { requireUser } from "@/lib/auth/user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Suspense } from "react";
import { ChevronDownIcon, MenuIcon } from "@/components/icons";
import { MenuButton } from "@/components/log-menu";
import { SavedNotice } from "@/components/saved-notice";

// Always rendered per request: depends on the session cookie.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your pools",
  robots: { index: false },
};

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await requireUser("/app");
  // For the pool switcher; fails open to a plain "Pools" link.
  const supabase = await createSupabaseServerClient();
  const { data: pools } = await supabase
    .from("pools")
    .select("id, name")
    .order("created_at")
    .limit(50)
    .returns<{ id: string; name: string }[]>();
  const link = "flex min-h-11 items-center rounded-lg px-3 font-semibold text-muted hover:text-foreground";

  return (
    <>
      <header className="border-b border-border bg-surface/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-3">
          <Link href="/app" aria-label="Your pools">
            <TuffoLockup size={32} />
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 text-sm">
            {pools && pools.length > 1 ? (
              <MenuButton
                label="Pools"
                placement="below-end"
                buttonClassName={`${link} flex items-center gap-1`}
                items={[
                  ...pools.map((p) => ({ href: `/app/pools/${p.id}`, label: p.name })),
                  { href: "/app", label: "All pools" },
                  { href: "/app/pools/new", label: "Add a pool" },
                ]}
              >
                Pools
                <ChevronDownIcon className="h-4 w-4" />
              </MenuButton>
            ) : (
              <Link href="/app" className={link}>
                Pools
              </Link>
            )}
            {/* Account, Admin and Sign out live in one menu at every width. */}
            <MenuButton
              label="Menu"
              placement="below-end"
              items={[
                { href: "/app/account", label: "Account" },
                ...(isAdmin(user) ? [{ href: "/app/admin", label: "Admin" }] : []),
                { href: "/auth/signout", label: "Sign out", post: true },
              ]}
              buttonClassName="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-lagoon/10 hover:text-foreground"
            >
              <MenuIcon className="h-5 w-5" />
            </MenuButton>
          </nav>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-8">
        <OfflineSync userId={user.id} />
        <InstallBanner />
        {children}
        <Suspense fallback={null}>
          <SavedNotice />
        </Suspense>
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
