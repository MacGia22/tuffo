import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  robots: { index: false },
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-16">
      <h1 className="text-4xl font-semibold">Privacy</h1>
      <p className="mt-6 text-muted">
        This page is a placeholder while Tuffo is in private beta. The full notice
        will be published before the beta opens. The commitments it will make are
        already fixed: Tuffo stores an email address, pool chemistry readings and a
        coarse pool location (about 5 km), and nothing else; there are no advertising
        trackers on this site; and every account can export or delete its data from
        the account page.
      </p>
      <p className="mt-6">
        <Link href="/" className="text-lagoon underline-offset-4 hover:underline">
          Back to Tuffo
        </Link>
      </p>
    </main>
  );
}
