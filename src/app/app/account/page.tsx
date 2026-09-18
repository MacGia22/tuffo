import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Units } from "@/lib/format";
import { DeleteForm, UnitsForm } from "./account-forms";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser("/app/account");
  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase.from("profiles").select("units").maybeSingle<{ units: Units }>();

  return (
    <>
      <nav className="text-sm text-muted">
        <Link href="/app" className="hover:text-foreground">
          Your pools
        </Link>{" "}
        / Account
      </nav>
      <div>
        <h1 className="text-3xl font-semibold">Account</h1>
        <p className="text-muted">Signed in as {user.email}.</p>
      </div>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-xl font-semibold">Units</h2>
        <UnitsForm units={profile?.units ?? "us"} />
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-xl font-semibold">Your data</h2>
        <p className="text-sm text-muted">
          Everything Tuffo holds about you: your email, unit preference, pools, tests, doses and events, as one JSON
          file. Locations are the 5 km weather cell and town name you chose; no address is stored.
        </p>
        <a
          href="/app/account/export"
          className="self-start rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:border-lagoon"
        >
          Download my data
        </a>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-surface p-5">
        <h2 className="text-xl font-semibold">Delete account</h2>
        <DeleteForm />
      </section>
    </>
  );
}
