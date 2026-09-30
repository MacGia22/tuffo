import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "What Tuffo keeps about you, who else handles it, how long it stays, and how to download or delete it.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy notice" updated="September 30, 2026">
      <p>
        Tuffo is a pool-care app: you log water tests, it shows what the weather did to your water and suggests what to
        add. This notice lists what Tuffo keeps about you, who else handles it, how long it stays, and how to take it
        with you or delete it. Questions go to <a href="mailto:privacy@tuffo.app">privacy@tuffo.app</a>.
      </p>

      <h2>Who runs Tuffo</h2>
      <p>
        Tuffo is an independent project run by its developer in St. Petersburg, Florida, in the United States. For
        anything about your data, write to <a href="mailto:privacy@tuffo.app">privacy@tuffo.app</a>.
      </p>

      <h2>What Tuffo keeps</h2>
      <h3>Your account</h3>
      <p>
        Your email address, which is how you sign in: Tuffo emails you a code or a link, and there is no password. Your
        choice of US or metric units. When the account was created and last signed in to. If you came through a link
        with a label (for example the name of a forum), that label, to see which places bring people to Tuffo.
      </p>
      <h3>Your pools</h3>
      <p>
        For each pool, the name you give it, its volume, surface and sanitizer, whether it has a cover, and optional
        numbers such as your fill water&apos;s calcium or your salt cell&apos;s output. The location is stored as a
        weather cell about 5 km (3 miles) across, plus the town name you picked and the time zone. Tuffo never stores a
        street address or a GPS position.
      </p>
      <h3>What you log</h3>
      <p>
        Water tests (the numbers, when and how you tested, and any note), the chemicals you added, and events such as
        topping up, backwashing or covering the pool.
      </p>
      <h3>What Tuffo works out</h3>
      <p>
        From your tests, what you added and the weather at your pool, Tuffo works out how fast each pool uses chlorine
        and keeps those figures with the pool. From them and the weather forecast for your pool&apos;s area it makes a
        7-day plan (what to add each day, days to watch), updated nightly and after each test. Both are deleted with the
        pool or your account.
      </p>
      <h3>Photo scans</h3>
      <p>
        When you scan a printout, a test strip or a tester screen, the photo goes to Anthropic&apos;s AI model, which
        reads the numbers and sends them back into the form for you to check. Tuffo does not store the photo. It keeps
        one log line per scan: the time, whether it worked, the kind of test, how sure the model was and how much
        processing it used. That log is what counts your monthly scans.
      </p>
      <h3>Feedback</h3>
      <p>
        When you send feedback from the app, Tuffo keeps your message, the kind you picked (idea, problem, question or
        other), when you sent it, the app page you sent it from (with pool identifiers removed), the app version,
        whether you said it is OK to email you about it, and the status the developer gives it. It is linked to your
        account so you can see your own feedback and its status. Only the developer reads it. To sort and group
        suggestions, the messages may be summarized with the help of Anthropic&apos;s AI model; that step sees the
        message, kind, page, app version, status and time, never your email address or account.
      </p>
      <h3>The waitlist</h3>
      <p>
        If you join the waitlist on the home page, Tuffo keeps your email address, when you joined and the label of the
        link that brought you (for example the name of a forum), only to invite you to the beta. It is deleted when you are invited or when you ask. To slow down automated sign-ups, the
        server briefly counts requests per network address in memory; the address is not stored.
      </p>
      <h3>Technical logs</h3>
      <p>
        The hosting and database providers record IP addresses and browser details in their server and security logs.
        They keep them for a short time, to run the service and to stop abuse. Tuffo does not combine them with
        anything else.
      </p>
      <h3>Error reports</h3>
      <p>
        When something breaks, Tuffo sends a report to Sentry: the error, the page it happened on, the app version and
        your browser type. Before a report leaves, Tuffo removes email addresses, cookies, anything you typed into a
        form and the parts of links that can carry sign-in codes. Reports do not say which account hit the error.
      </p>

      <h2>What Tuffo does not collect</h2>
      <p>
        No name, phone number, payment details, precise location or contacts. There is no advertising and no analytics
        tracking. The only cookies are the ones that keep you signed in.
      </p>
      <p>
        So the app works without signal, your device keeps copies of the app pages you open and any test, dose or event
        you log while offline, until it is sent. These stay on your device and are not shared. Signing out removes the
        page copies; entries still waiting are sent the next time you sign in on that device.
      </p>

      <h2>Why Tuffo uses it</h2>
      <ul>
        <li>
          To run the service you signed up for: signing you in, keeping your pool history, working out doses and
          matching your tests with the weather at your pool. For readers in the EU and UK, the legal basis is the
          contract between you and Tuffo.
        </li>
        <li>
          To improve Tuffo from the feedback you send, and to reply when you said it is OK to email you. Legal basis:
          legitimate interest.
        </li>
        <li>
          To keep the service secure and affordable, for example by limiting photo scans. Legal basis: legitimate
          interest.
        </li>
        <li>
          To make the advice better. Tuffo may study de-identified, aggregated data, such as how fast chlorine drops in
          strong sun across many pools, to tune its dosing models. Aggregated data cannot identify you or your pool.
          Legal basis: legitimate interest, and you can object at privacy@tuffo.app.
        </li>
      </ul>
      <p>
        Tuffo emails you sign-in codes and, rarely, messages about your account or about changes to this notice or the
        terms. It sends no marketing email unless you ask for it.
      </p>

      <h2>Who else handles your data</h2>
      <p>
        These providers run parts of Tuffo. Each handles your data only to provide its service to Tuffo, under its own
        data-processing terms.
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> runs the database and the sign-in system. Data is stored in the United States (US
          East).
        </li>
        <li>
          <strong>Vercel</strong> hosts the website and the app, in the United States.
        </li>
        <li>
          <strong>Resend</strong> sends the sign-in emails, from the United States.
        </li>
        <li>
          <strong>Anthropic</strong> reads the numbers in photos you choose to scan, in the United States. Under
          Anthropic&apos;s commercial terms, the photo is not used to train its models and is deleted within 30 days.
          Its AI model may also help summarize feedback messages, as described above, without your email address or
          account.
        </li>
        <li>
          <strong>Open-Meteo</strong> provides the weather and the town search. It receives the coordinates of your
          weather cell and, when you look up a town, the text you type. It never receives your email or anything else
          that identifies you.
        </li>
        <li>
          <strong>Sentry</strong> receives the error reports described above, in the United States.
        </li>
        <li>
          <strong>ImprovMX</strong> forwards email sent to tuffo.app addresses to the developer&apos;s inbox.
        </li>
      </ul>
      <p>
        Tuffo does not sell your personal information and does not share it for advertising. It would disclose data
        only when the law requires it, such as under a valid court order, and would tell you first unless that is
        forbidden. If Tuffo moves into a company or is sold, your data would move with it under this notice, and you
        would be told beforehand.
      </p>

      <h2>Where your data is</h2>
      <p>
        In the United States. If you use Tuffo from the EU, the UK or anywhere else, your data is transferred to the US.
        Those transfers rely on the providers&apos; data-processing terms, including the European Commission&apos;s
        standard contractual clauses where they apply.
      </p>

      <h2>How long it is kept</h2>
      <ul>
        <li>
          Your account, pools and logs: until you delete them or your account. An account unused for two years may be
          deleted, after an email warning you first.
        </li>
        <li>Feedback: until you delete your account.</li>
        <li>The photo-scan log: 12 months.</li>
        <li>Error reports: 90 days at most.</li>
        <li>Waitlist emails: until you are invited, or until you ask to be removed.</li>
        <li>The providers&apos; technical logs: their own short periods, usually days to weeks.</li>
      </ul>
      <p>
        Deleting your account removes it from the live database at once, with every pool, test, dose, event, plan,
        feedback message and scan log line. Copies in the database provider&apos;s backups expire on the provider&apos;s own schedule.
      </p>

      <h2>Your rights</h2>
      <ul>
        <li>
          Download everything: <Link href="/app/account">Account</Link>, then <strong>Download my data</strong>, gives
          you one JSON file.
        </li>
        <li>Correct it: change your units, or remove any test, dose or event and log it again.</li>
        <li>
          Delete it: <Link href="/app/account">Account</Link>, then <strong>Delete account</strong>, removes everything
          in one step.
        </li>
        <li>
          Anything else, such as objecting to a use of your data: write to{" "}
          <a href="mailto:privacy@tuffo.app">privacy@tuffo.app</a>. You will get an answer within 30 days.
        </li>
      </ul>
      <p>
        In the EU and the UK you can also ask Tuffo to restrict how it uses your data, and you can complain to your data
        protection authority. In California and other US states with privacy laws, you have the rights those laws give
        you, such as to know, correct and delete, and using them will not change how Tuffo treats you. There is nothing
        to opt out of: Tuffo does not sell or share personal information.
      </p>

      <h2>Security</h2>
      <p>
        Everything travels over HTTPS. The database keeps each account&apos;s pools and tests apart with row-level
        security, so one account cannot read another&apos;s, and the provider encrypts the data at rest. The keys that
        can reach all data exist only on Tuffo&apos;s server. If a breach ever affects your data, Tuffo will tell you,
        and the authorities where the law requires, without undue delay.
      </p>

      <h2>Children</h2>
      <p>
        Tuffo is for adults, 18 and over, and is not aimed at children. If Tuffo learns that a child has signed up, it
        deletes the account.
      </p>

      <h2>Changes</h2>
      <p>
        When this notice changes, so does the date at the top. Before a change that matters to you takes effect, such as
        a new kind of data or a new provider that sees personal data, Tuffo will tell you in the app or by email.
      </p>

      <h2>Contact</h2>
      <p>
        <a href="mailto:privacy@tuffo.app">privacy@tuffo.app</a>
      </p>
    </LegalPage>
  );
}
