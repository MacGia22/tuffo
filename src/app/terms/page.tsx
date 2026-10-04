import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The agreement for using Tuffo, including the chemical safety rules and what belongs to whom.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="October 4, 2026">
      <p>
        These terms are the agreement between you and Tuffo&apos;s developer for using Tuffo at tuffo.app. By signing
        in, you accept them. If something here is unclear, ask at <a href="mailto:hello@tuffo.app">hello@tuffo.app</a>.
      </p>

      <h2>Tuffo in one paragraph</h2>
      <p>
        Tuffo stores your pool tests, shows how the weather moved your water and suggests what to add. It advises; you
        decide what goes in the pool. It is in beta and free. What you log stays yours, and you can download it or
        delete it at any time.
      </p>

      <h2>Who can use it</h2>
      <p>
        You must be 18 or older. One account per person, not shared. Your email inbox is the key to your account, so
        keep it secure.
      </p>

      <h2>The beta</h2>
      <p>
        Tuffo is new. Features will change and some things will break. Losing data is unlikely but possible, so keep
        your own copy of anything you cannot lose (<Link href="/app/account">Account</Link>, then{" "}
        <strong>Download my data</strong>).
      </p>
      <p>
        Tuffo is free during the beta. Paid features may come later. If they do, you will be told what costs money
        before anything is charged, and you will always be able to download what you have logged.
      </p>

      <h2>Chemical safety</h2>
      <p>
        <strong>Read this part.</strong> Tuffo&apos;s doses are estimates, worked out from the numbers you enter, the
        pool details you give, the weather and published water chemistry. Test kits have errors and every pool behaves a
        little differently. So:
      </p>
      <ul>
        <li>Read and follow the label on every product.</li>
        <li>
          Never mix pool chemicals with each other, not even in a bucket. Chlorine and acid together release chlorine
          gas.
        </li>
        <li>Add chemicals to water, never water to chemicals, with the pump running.</li>
        <li>Wear eye protection and gloves, and keep chemicals away from children and pets.</li>
        <li>For green or cloudy water, or anything you are unsure about, ask a pool professional.</li>
        <li>After a large dose, retest before anyone swims.</li>
      </ul>
      <p>
        You decide what to add and when people swim. As far as the law allows, Tuffo is not responsible for damage to
        equipment, surfaces, clothing or health that comes from following or ignoring its suggestions.
      </p>

      <h2>Photo scanning</h2>
      <p>
        Numbers read from a photo can be wrong. Check every number before you save the test. Scans have a monthly
        allowance, shown under the scan button, because each one costs money to run. Photos you share when reporting a
        misread are used only to improve the scan and are never published.
      </p>

      <h2>Your data</h2>
      <p>
        What you enter is yours. You allow Tuffo to store and process it to run the service for you, as the{" "}
        <Link href="/privacy">privacy notice</Link> describes. You also allow Tuffo to use it in de-identified,
        aggregated form, meaning numbers that cannot identify you or your pool, to improve its models. That aggregated
        data may outlive your account; everything that identifies you is deleted with it.
      </p>

      <h2>What belongs to Tuffo</h2>
      <p>
        The app, its dosing and weather models, its code, and the Tuffo name and logo belong to Tuffo&apos;s developer.
        These terms let you use Tuffo for the pools you own or look after, and give you no other rights in it. You agree
        not to:
      </p>
      <ul>
        <li>copy, scrape or bulk-download the service or its suggestions;</li>
        <li>reverse-engineer it, or try to work out its models, coefficients or code;</li>
        <li>use bots or scripts to access it;</li>
        <li>get around its limits, such as the scan allowance, or its security;</li>
        <li>use it to build a competing product, or resell it.</li>
      </ul>

      <h2>Fair use</h2>
      <p>
        Do not use Tuffo to break the law or to attack or overload it, and do not scan photos of anything other than
        test results.
      </p>

      <h2>Closing an account</h2>
      <p>
        You can delete your account at any time from the <Link href="/app/account">Account</Link> page. Tuffo may
        suspend or close an account that breaks these terms, and will say why where it can. If Tuffo ever shuts down,
        you will get at least 30 days&apos; notice to download your data.
      </p>

      <h2>No warranty</h2>
      <p>
        <strong>
          Tuffo is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. As far as the law allows, its developer
          gives no warranties of any kind, express or implied, including about the accuracy of its suggestions, their
          fitness for a particular purpose, or the service running without interruption.
        </strong>
      </p>

      <h2>Limit of liability</h2>
      <p>
        As far as the law allows, Tuffo&apos;s developer is not liable for indirect, incidental, special or
        consequential damages, or for lost data, lost profits, or damage to pool equipment or surfaces, arising from your
        use of Tuffo. Total liability for any claim is limited to the greater of what you paid for Tuffo in the 12
        months before the claim and US$50. Nothing in these terms limits liability that the law does not allow to be
        limited, such as for fraud or for death or injury caused by negligence, or takes away your rights as a
        consumer where you live.
      </p>

      <h2>Changes</h2>
      <p>
        Tuffo may update these terms, and the date at the top will change when it does. For changes that matter, you
        will be told in the app or by email at least 14 days before they apply. If you keep using Tuffo after that, the
        new terms apply; if you do not agree, you can delete your account.
      </p>

      <h2>Law and disputes</h2>
      <p>
        These terms are governed by the laws of the State of Florida and of the United States, without regard to
        conflict-of-law rules. Disputes go to the state or federal courts for Pinellas County, Florida. If you live in
        the EU, the UK or another country whose consumer law gives you more protection, that protection still applies,
        including your right to bring a claim in your own courts.
      </p>

      <h2>Contact</h2>
      <p>
        <a href="mailto:hello@tuffo.app">hello@tuffo.app</a>
      </p>
    </LegalPage>
  );
}
