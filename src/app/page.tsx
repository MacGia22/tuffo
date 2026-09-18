import Link from "next/link";
import { TuffoLockup, TuffoMark } from "@/components/brand/logo";
import { WaitlistForm } from "@/components/waitlist-form";

const steps = [
  {
    title: "Log a test in thirty seconds",
    body: "Drop kit, strips or the printout from the pool store. Free chlorine, pH, alkalinity, calcium, stabilizer, salt: type the numbers, done.",
  },
  {
    title: "See what the weather did",
    body: "Tuffo pulls the sun, heat and rain your pool actually got between two tests and shows why chlorine dropped or stabilizer drifted.",
  },
  {
    title: "Plan the week ahead",
    body: "With the forecast and your pool's own history, it tells you what to add and when, in the units of the product you have in hand.",
  },
];

export default function Home() {
  return (
    <>
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <Link href="/" aria-label="Tuffo home">
          <TuffoLockup size={36} />
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted sm:inline">
            Private beta
          </span>
          <Link
            href="/login"
            className="rounded-xl bg-lagoon px-4 py-2 text-sm font-semibold text-white transition hover:bg-lagoon-deep"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-20 px-5 pb-24 pt-10">
        <section className="flex flex-col gap-8 md:flex-row md:items-center md:gap-14">
          <div className="flex flex-1 flex-col gap-6">
            <h1 className="text-5xl font-semibold leading-[1.02] text-foreground sm:text-6xl">
              Your pool, <span className="text-lagoon">forecast.</span>
            </h1>
            <p className="max-w-xl text-lg text-muted">
              Pool chemistry that knows your weather. Log a water test, see what the
              sun, heat and rain did between readings, and get a seven-day dosing plan
              for your own pool.
            </p>
            <WaitlistForm />
            <p className="text-sm text-muted">
              Free during the beta. No ads, no tracking, works with any test kit.
            </p>
          </div>
          <div className="flex justify-center md:flex-none">
            <TuffoMark width={220} height={220} className="drop-shadow-xl" />
          </div>
        </section>

        <section aria-labelledby="how" className="grid gap-6 md:grid-cols-3">
          <h2 id="how" className="sr-only">
            How it works
          </h2>
          {steps.map((step, index) => (
            <article
              key={step.title}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6"
            >
              <span className="font-display text-sm font-semibold text-lagoon">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="text-xl font-semibold">{step.title}</h3>
              <p className="text-muted">{step.body}</p>
            </article>
          ))}
        </section>

        <section className="rounded-2xl bg-navy px-6 py-10 text-white sm:px-10">
          <h2 className="text-2xl font-semibold">Why weather?</h2>
          <p className="mt-3 max-w-2xl text-white/80">
            Sunlight burns off chlorine, heat speeds everything up, and a heavy rain
            dilutes stabilizer and calcium. Every calculator app treats each test as a
            fresh start. Tuffo treats your pool as the same pool, under the sky it is
            actually under, and learns how it behaves.
          </p>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-5 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Tuffo. Made in St. Petersburg, Florida.</p>
          <nav className="flex gap-5">
            <Link href="/login" className="hover:text-foreground">
              Sign in
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
