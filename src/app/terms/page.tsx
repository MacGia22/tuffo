import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms",
  robots: { index: false },
};

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-16">
      <h1 className="text-4xl font-semibold">Terms</h1>
      <p className="mt-6 text-muted">
        This page is a placeholder while Tuffo is in private beta. The full terms
        will be published before the beta opens. One line will be in them from day
        one: Tuffo gives chemistry advice, and the person at the pool decides what to
        add. Follow the safety instructions on every product, never mix chemicals, and
        use your own judgement.
      </p>
      <p className="mt-6">
        <Link href="/" className="text-lagoon underline-offset-4 hover:underline">
          Back to Tuffo
        </Link>
      </p>
    </main>
  );
}
