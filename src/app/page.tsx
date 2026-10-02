import Link from "next/link";
import { TuffoLockup, TuffoMark } from "@/components/brand/logo";
import { StartFreeLink } from "@/components/start-free-link";
import { WaitlistForm } from "@/components/waitlist-form";
import { ForecastForm } from "./forecast/forecast-form";
import { serverEnv } from "@/lib/env";

const steps = [
  {
    title: "Log a test in thirty seconds",
    body: "Type the numbers from a drop kit or strips, photograph the pool store's printout, or import your Pool Math history. No signal at the pool? It saves on your phone and sends later.",
  },
  {
    title: "See what the weather did",
    body: "Tuffo pulls the sun, heat and rain your pool actually got between two tests and shows why chlorine dropped or stabilizer drifted.",
  },
  {
    title: "Plan the week ahead",
    body: "From the forecast and how fast your pool has used chlorine, it shows how much liquid chlorine to add each day (or where to set a salt cell), and flags algae-risk days and heavy rain.",
  },
];

const screens = [
  {
    name: "plan",
    width: 1600,
    height: 693,
    alt: "The week's plan: today add 1 quart of liquid chlorine, with each day's amount, the chlorine the pool is expected to use, and a heavy-rain note on Friday.",
  },
  {
    name: "trends",
    width: 1600,
    height: 1167,
    alt: "Charts of the last 14 days: free chlorine staying in its target band with the plan's line ahead, pH, peak UV and rain.",
  },
];

const faq = [
  {
    q: "Is Tuffo free?",
    a: "Yes, during the beta. If that ever changes you will hear about it well before, and you can download everything you logged at any time from your account page.",
  },
  {
    q: "Can I bring my Pool Math history?",
    a: "Yes. In Pool Math, use Export All Test Logs (.csv), then Import CSV on your pool's page. Your tests come in with their dates; chemical additions are not in Pool Math's export.",
  },
  {
    q: "What data does Tuffo keep?",
    a: "Your email address, your pools (size, surface, sanitizer, equipment) and the tests, chemicals and events you log. A pool's location is kept only as a weather area about 3 km (2 miles) across and the town name you picked, never an address. Photos you scan are read once and not stored. There are no ads and no trackers. The full list is in the privacy notice, and you can download or delete everything from your account.",
  },
];

export default function Home() {
  // Open: "Start free" goes straight to sign-in. Closed (SIGNUPS_OPEN=false): the waitlist.
  const open = serverEnv.signupsOpen();
  return (
    <>
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <Link href="/" aria-label="Tuffo home">
          <TuffoLockup size={36} />
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted sm:inline">
            {open ? "Free beta" : "Private beta"}
          </span>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-lagoon underline-offset-2 hover:underline"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-20 px-5 pb-24 pt-10">
        <section className="flex flex-col gap-8 md:flex-row md:items-center md:gap-14">
          <div className="flex flex-1 flex-col gap-6">
            <p className="font-display text-sm font-semibold uppercase tracking-wider text-lagoon">
              Tuffo · pool care app
            </p>
            <h1 className="text-5xl font-semibold leading-[1.02] text-foreground sm:text-6xl">
              Your pool, <span className="text-lagoon">forecast.</span>
            </h1>
            <section
              aria-labelledby="your-week"
              className="flex flex-col gap-3 rounded-2xl border border-lagoon/40 bg-surface p-4 sm:p-5"
            >
              <h2 id="your-week" className="text-xl font-semibold">
                See your pool&apos;s week, <span className="whitespace-nowrap">no sign up</span>
              </h2>
              <ForecastForm current={null} refLabel={null} />
            </section>
            <p className="max-w-xl text-lg text-muted">
              Pool chemistry that knows your weather. Log a water test, see what the
              sun, heat and rain did between readings, get advice on what to add now,
              and a seven-day chlorine plan for your own pool.
            </p>
            {open ? (
              <StartFreeLink className="self-start rounded-xl border border-lagoon px-6 py-3 text-base font-semibold text-lagoon transition hover:bg-lagoon/10">
                Start free
              </StartFreeLink>
            ) : (
              <WaitlistForm />
            )}
            <p className="text-sm text-muted">
              Free during the beta. Works with any test kit.
              {open ? " Sign in with Google or your email: no password." : ""}
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

        <section aria-labelledby="see" className="flex flex-col gap-4">
          <h2 id="see" className="text-2xl font-semibold">
            What it looks like
          </h2>
          <figure className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-3 sm:p-5">
            {screens.map((shot) => (
              <picture key={shot.name}>
                <source srcSet={`/screens/${shot.name}-dark.webp`} media="(prefers-color-scheme: dark)" />
                {/* A static screenshot; plain img keeps the light/dark art direction simple. */}
                <img
                  src={`/screens/${shot.name}-light.webp`}
                  width={shot.width}
                  height={shot.height}
                  alt={shot.alt}
                  loading="lazy"
                  className="h-auto w-full rounded-xl"
                />
              </picture>
            ))}
            <figcaption className="text-sm text-muted">
              A pool&apos;s week: what to add each day from the forecast, then the last two weeks of free chlorine, pH,
              sun and rain, with the plan ahead dashed. Demo data.
            </figcaption>
          </figure>
        </section>

        <section className="rounded-2xl bg-navy px-6 py-10 text-white sm:px-10">
          <h2 className="text-2xl font-semibold">Why weather?</h2>
          <p className="mt-3 max-w-2xl text-white/80">
            Sunlight burns off chlorine, heat speeds everything up, and a heavy rain
            dilutes stabilizer and calcium. Tuffo reads each test together with your
            pool&apos;s own history and the weather it actually had, and learns how your
            pool uses chlorine.
          </p>
        </section>

        <section aria-labelledby="about" className="flex max-w-3xl flex-col gap-3">
          <h2 id="about" className="text-2xl font-semibold">
            About Tuffo
          </h2>
          <p className="text-muted">
            Tuffo is a web app for people who look after their own swimming pool. You log your water tests (free
            chlorine, pH, alkalinity, calcium, stabilizer, salt), and Tuffo matches them with the weather at your pool
            to explain what changed and suggest how much of each chemical to add. Tuffo advises; you decide.
          </p>
          <p className="text-muted">
            You can sign in with your email address or with your Google account. With Google, Tuffo uses your account
            only to confirm your email address and sign you in; it does not read your contacts, files, calendar or
            anything else. What Tuffo keeps and why is in the{" "}
            <Link href="/privacy" className="font-semibold text-lagoon underline-offset-2 hover:underline">
              privacy notice
            </Link>
            .
          </p>
        </section>
        <section aria-labelledby="faq" className="flex max-w-3xl flex-col gap-3">
          <h2 id="faq" className="text-2xl font-semibold">
            Questions
          </h2>
          {faq.map((item) => (
            <details key={item.q} className="group rounded-2xl border border-border bg-surface p-4">
              <summary className="cursor-pointer font-semibold">{item.q}</summary>
              <p className="mt-2 text-muted">{item.a}</p>
            </details>
          ))}
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
            <a href="mailto:hello@tuffo.app" className="hover:text-foreground">
              Contact
            </a>
          </nav>
        </div>
      </footer>
    </>
  );
}
