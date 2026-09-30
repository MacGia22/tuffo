import type { Metadata } from "next";
import Link from "next/link";
import { TuffoLockup } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Stop alert emails", robots: { index: false } };

/**
 * Where the "Stop all alert emails" link in an email lands. One button, because mail
 * scanners open links on their own and must not switch alerts off by doing so.
 */
export default async function UnsubscribePage({ searchParams }: PageProps<"/alerts/unsubscribe">) {
  const { t, done } = await searchParams;
  const token = typeof t === "string" ? t : "";

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start gap-4 px-5 py-12">
      <TuffoLockup size={32} />
      {done ? (
        <>
          <h1 className="text-3xl font-semibold">Alert emails are off</h1>
          <p className="text-muted">
            Tuffo will not send you alerts any more. You can switch them back on for each pool on your account page.
          </p>
          <Link href="/app/account#alerts" className="font-semibold text-lagoon">
            Account page
          </Link>
        </>
      ) : token ? (
        <>
          <h1 className="text-3xl font-semibold">Stop alert emails?</h1>
          <p className="text-muted">This switches off every Tuffo alert for all your pools. Sign-in emails still come when you ask for them.</p>
          <form method="post" action="/api/alerts/unsubscribe">
            <input type="hidden" name="t" value={token} />
            <button type="submit" className="rounded-xl bg-lagoon px-5 py-2.5 text-sm font-semibold text-white hover:bg-lagoon-deep">
              Stop alert emails
            </button>
          </form>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-semibold">Alert emails</h1>
          <p className="text-muted">Change your alerts on your account page.</p>
          <Link href="/app/account#alerts" className="font-semibold text-lagoon">
            Account page
          </Link>
        </>
      )}
    </main>
  );
}
