import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/user";
import { feedbackHref } from "@/lib/feedback";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Units } from "@/lib/format";
import { DeleteForm, UnitsForm } from "./account-forms";
import { AlertsForm, type AlertChoices } from "./alerts-form";
import { ScanPhotos, type SharedPhoto } from "./scan-photos";
import { formatDate } from "@/lib/format";
import { signedPhotoUrls } from "@/lib/scan/report-store";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Account" };

/**
 * The photos this person shared with misread reports, with 5-minute signed URLs for the
 * thumbnails; null hides the section (before the migration, or when it fails).
 */
async function loadSharedPhotos(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>): Promise<SharedPhoto[] | null> {
  const { data, error } = await supabase
    .from("scan_reports")
    .select("id, created_at, kind, photo_path")
    .not("photo_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<{ id: string; created_at: string; kind: "test" | "pump"; photo_path: string }[]>();
  if (error) return null;
  if (!data || data.length === 0) return [];
  let urls = new Map<string, string>();
  try {
    urls = await signedPhotoUrls(createSupabaseAdminClient(), data.map((r) => r.photo_path));
  } catch {
    console.error("[scan-report] no service client for photo thumbnails");
  }
  return data.map((r) => ({ id: r.id, date: formatDate(r.created_at, "UTC"), kind: r.kind, url: urls.get(r.photo_path) ?? null }));
}

export default async function AccountPage() {
  const user = await requireUser("/app/account");
  const supabase = await createSupabaseServerClient();
  const [{ data: profile }, { data: pools }, { data: alertRows }, sharedPhotos] = await Promise.all([
    supabase.from("profiles").select("units").maybeSingle<{ units: Units }>(),
    supabase.from("pools").select("id, name").order("created_at").returns<{ id: string; name: string }[]>(),
    supabase
      .from("alert_settings")
      .select("pool_id, algae, test_reminder, test_after_days, weekly, maintenance")
      .returns<(AlertChoices & { pool_id: string })[]>(),
    loadSharedPhotos(supabase),
  ]);
  const off: AlertChoices = { algae: false, test_reminder: false, test_after_days: 7, weekly: false, maintenance: false };

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
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

      <section id="alerts" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-xl font-semibold">Email alerts</h2>
        <p className="text-sm text-muted">
          Off unless you switch them on, per pool. At most one email a day, around 7:30 am Eastern, from
          hello@tuffo.app; every email has a link to stop them.
        </p>
        {pools && pools.length > 0 ? (
          pools.map((pool) => (
            <AlertsForm
              key={pool.id}
              poolId={pool.id}
              poolName={pool.name}
              choices={alertRows?.find((r) => r.pool_id === pool.id) ?? off}
            />
          ))
        ) : (
          <p className="text-sm text-muted">Add a pool first.</p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-xl font-semibold">Your data</h2>
        <p className="text-sm text-muted">
          Everything Tuffo holds about you: your email, unit preference, pools, tests, doses, events, the 7-day plans, your
          alert choices and the alerts sent, the feedback you sent, a log of your photo scans (when, not the photos) and
          the misread reports you sent, as one JSON file. Photos you shared with a report are not in the file; view or
          delete them under Shared scan photos. Locations are the 3 km weather cell and town name you chose; no address
          is stored.
        </p>
        <a
          href="/app/account/export"
          className="self-start rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:border-lagoon"
        >
          Download my data
        </a>
      </section>

      {sharedPhotos ? (
        <section id="scan-photos" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-xl font-semibold">Shared scan photos</h2>
          <p className="text-sm text-muted">
            Photos you chose to share when reporting a misread. Only Tuffo sees them; each is deleted 12 months after you
            shared it. Deleting a photo keeps the text of the report.
          </p>
          <ScanPhotos photos={sharedPhotos} />
        </section>
      ) : null}

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-xl font-semibold">Feedback</h2>
        <p className="text-sm text-muted">Send an idea, a problem or a question, and see what happened to earlier ones.</p>
        <Link
          href={feedbackHref("/app/account")}
          className="self-start rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:border-lagoon"
        >
          Send feedback
        </Link>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-xl font-semibold">Sign out</h2>
        <p className="text-sm text-muted">Signs you out on this device. Entries saved offline stay here until they are sent.</p>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:border-lagoon"
          >
            Sign out
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-surface p-5">
        <h2 className="text-xl font-semibold">Delete account</h2>
        <DeleteForm />
      </section>
    </>
  );
}
