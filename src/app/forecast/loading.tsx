import Link from "next/link";
import { TuffoLockup } from "@/components/brand/logo";
import { Bone, LoadingStatus } from "@/components/skeleton";

/** The forecast while it loads: the page's header and title, the place line and the 7 day cards. */
export default function Loading() {
  return (
    <>
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <Link href="/" aria-label="Tuffo home">
          <TuffoLockup size={32} />
        </Link>
        <Link href="/login" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-lagoon hover:underline">
          Sign in
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 pb-20 pt-4">
        <LoadingStatus />
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold sm:text-4xl">Your pool&apos;s week</h1>
          <p className="text-muted">
            How much chlorine a pool in your town will use each day this week, from the sun, heat and rain forecast. No
            sign-up.
          </p>
        </div>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Bone className="h-8 w-full max-w-xl" />
            <Bone className="h-6 w-64 max-w-full" />
          </div>
          <Bone className="h-9 w-full rounded-xl" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} aria-hidden="true" className="flex h-36 flex-col gap-2 rounded-2xl border border-border bg-surface p-3">
                <Bone className="h-4 w-12" />
                <Bone className="h-6 w-16" />
                <Bone className="h-4 w-20" />
                <Bone className="h-4 w-14" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
