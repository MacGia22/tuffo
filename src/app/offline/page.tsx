import type { Metadata } from "next";
import Link from "next/link";
import { TuffoLockup } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Offline", robots: { index: false } };

/** Shown by the service worker for a page that was never opened on this device. */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start gap-4 px-5 py-12">
      <TuffoLockup size={32} />
      <h1 className="text-3xl font-semibold">You are offline</h1>
      <p className="text-muted">
        This page has not been opened on this device yet, so there is no copy to show. Pages you opened recently still
        work, and tests, doses and events you log are kept on the device and sent when you are back online.
      </p>
      <Link href="/app" className="rounded-xl bg-action px-4 py-2.5 text-sm font-semibold text-white hover:bg-action-deep">
        Your pools
      </Link>
    </main>
  );
}
