import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmButton } from "@/components/confirm-button";
import { requireAdmin } from "@/lib/auth/admin";
import { parseAdminEmails } from "@/lib/beta";
import { serverEnv } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deleteBlock, sourceCounts, userRows, type UserRow } from "@/lib/admin-users";
import { refFunnel } from "@/lib/ref-visits";
import { FeedbackStatusBadge } from "@/components/feedback-status";
import {
  FEEDBACK_KINDS,
  FEEDBACK_STATUSES,
  isFeedbackKind,
  isFeedbackStatus,
  KIND_LABELS,
  STATUS_LABELS,
  type FeedbackKind,
  type FeedbackStatus,
} from "@/lib/feedback";
import { deleteScanReportPhoto, deleteUserAccount, inviteEmail, removeFromWaitlist, setFeedbackStatus, setScanReportStatus } from "./actions";
import { ReadAgain } from "./read-again";
import { reportLines, type ReportKind } from "@/lib/scan/report";
import { signedPhotoUrls } from "@/lib/scan/report-store";

export const metadata: Metadata = { title: "Admin" };

const MESSAGES: Record<string, { text: string; error?: boolean }> = {
  invited: { text: "Invitation sent. The address has left the waitlist." },
  "already-user": { text: "That address already has an account; it has left the waitlist." },
  removed: { text: "Removed from the waitlist." },
  "bad-email": { text: "That email address does not look right.", error: true },
  "invite-failed": { text: "The invitation could not be sent. Check the Supabase logs.", error: true },
  "remove-failed": { text: "Could not remove it. Try again.", error: true },
  "status-saved": { text: "Feedback status saved." },
  "status-failed": { text: "Could not change the status. Try again.", error: true },
  "user-deleted": { text: "Account deleted, with its pools, logs and feedback." },
  "delete-blocked": { text: "Your own account and other admins' accounts cannot be deleted here.", error: true },
  "delete-failed": { text: "Could not delete the account. Check the server logs.", error: true },
  "report-saved": { text: "Scan report status saved." },
  "photo-deleted": { text: "Photo deleted; the text report stays." },
  "report-failed": { text: "Could not change the scan report. Check the server logs.", error: true },
};

interface ScanReportRow {
  id: string;
  created_at: string;
  kind: ReportKind;
  source: string | null;
  model: string | null;
  prompt_version: string | null;
  read: unknown;
  corrected: unknown;
  note: string | null;
  photo_path: string | null;
  status: "new" | "reviewed" | "fixed";
}

const REPORT_STATUS_LABELS: Record<ScanReportRow["status"], string> = { new: "New", reviewed: "Reviewed", fixed: "Fixed" };

/** Misread reports, newest first, with 5-minute signed URLs for shared photos. No user or email. */
async function loadScanReports() {
  const admin = createSupabaseAdminClient();
  const { data, count, error } = await admin
    .from("scan_reports")
    .select("id, created_at, kind, source, model, prompt_version, read, corrected, note, photo_path, status", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<ScanReportRow[]>();
  const rows = data ?? [];
  const urls = await signedPhotoUrls(admin, rows.flatMap((r) => (r.photo_path ? [r.photo_path] : [])));
  return { rows, count, error, urls };
}

interface FeedbackRow {
  id: string;
  user_id: string;
  created_at: string;
  kind: FeedbackKind;
  message: string;
  page: string | null;
  app_version: string | null;
  contact_ok: boolean;
  status: FeedbackStatus;
}

/** Newest feedback first, filtered; with the sender's email only where they said it is OK to write. */
async function loadFeedback(kind: FeedbackKind | null, status: FeedbackStatus | null) {
  const admin = createSupabaseAdminClient();
  let query = admin
    .from("feedback")
    .select("id, user_id, created_at, kind, message, page, app_version, contact_ok, status", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(200);
  if (kind) query = query.eq("kind", kind);
  if (status) query = query.eq("status", status);
  const { data, count, error } = await query.returns<FeedbackRow[]>();
  const rows = data ?? [];

  const emails = new Map<string, string>();
  const contactable = [...new Set(rows.filter((r) => r.contact_ok).map((r) => r.user_id))];
  await Promise.all(
    contactable.map(async (id) => {
      const { data: found } = await admin.auth.admin.getUserById(id);
      if (found.user?.email) emails.set(id, found.user.email);
    }),
  );
  return { rows, count, error, emails };
}

/** Every account (up to 1,000), newest first; null when the auth admin API fails. */
async function loadUsers() {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    console.error(`[admin] list users: ${error.status ?? ""} ${error.message}`);
    return null;
  }
  return userRows(data.users);
}

/** Days of link visits the funnel adds up. */
const FUNNEL_DAYS = 30;

/**
 * Visits per link label over the last FUNNEL_DAYS days (today included, UTC) next to
 * all-time sign-ups and first tests; null when the counter is not there yet.
 */
async function loadFunnel(users: UserRow[] | null) {
  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - (FUNNEL_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  const [visits, tested] = await Promise.all([
    admin.from("ref_visits").select("label, visits").gte("day", since).limit(10_000).returns<{ label: string; visits: number }[]>(),
    admin.rpc("users_with_tests"),
  ]);
  if (visits.error || tested.error) {
    const error = visits.error ?? tested.error;
    console.error(`[admin] link funnel: ${error?.code ?? ""} ${error?.message ?? ""}`);
    return null;
  }
  return refFunnel(visits.data ?? [], users ?? [], new Set(((tested.data ?? []) as { user_id: string }[]).map((t) => t.user_id)));
}

interface Entry {
  email: string;
  source: string | null;
  created_at: string;
}

/**
 * Private-beta admin: feedback, users, link visits, the waitlist, and invitations by email. Hidden (404)
 * from everyone not in ADMIN_EMAILS.
 */
export default async function AdminPage({ searchParams }: PageProps<"/app/admin">) {
  const me = await requireAdmin();
  const admins = parseAdminEmails(serverEnv.adminEmails());
  const { status, kind: kindParam, fstatus } = await searchParams;
  const message = typeof status === "string" ? MESSAGES[status] : undefined;
  const kindFilter = isFeedbackKind(kindParam) ? kindParam : null;
  const statusFilter = isFeedbackStatus(fstatus) ? fstatus : null;
  const filters = new URLSearchParams();
  if (kindFilter) filters.set("kind", kindFilter);
  if (statusFilter) filters.set("fstatus", statusFilter);
  const [feedback, users, reports] = await Promise.all([loadFeedback(kindFilter, statusFilter), loadUsers(), loadScanReports()]);
  const funnel = await loadFunnel(users);

  const admin = createSupabaseAdminClient();
  const { data: entries, count, error } = await admin
    .from("waitlist")
    .select("email, source, created_at", { count: "exact" })
    .order("created_at", { ascending: true })
    .limit(200)
    .returns<Entry[]>();

  const input =
    "h-11 flex-1 rounded-xl border border-border-input bg-background px-3 text-base outline-none focus:border-lagoon focus:ring-2 focus:ring-lagoon/30";

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/app" className="hover:text-foreground">
          Your pools
        </Link>{" "}
        / Admin
      </nav>
      <div>
        <h1 className="text-3xl font-semibold">Admin</h1>
        <p className="text-muted">Feedback from the app, users, links, the waitlist, and invitations.</p>
      </div>

      {message ? (
        <p role="status" className={`text-sm ${message.error ? "text-red-600" : "text-muted"}`}>
          {message.text}
        </p>
      ) : null}

      <section id="feedback" className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">
          Feedback{feedback.count !== null && feedback.count !== undefined ? ` (${feedback.count})` : ""}
        </h2>
        <form method="get" action="/app/admin#feedback" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Kind
            <select name="kind" defaultValue={kindFilter ?? ""} className="h-11 rounded-xl border border-border-input bg-background px-2 text-base">
              <option value="">All</option>
              {FEEDBACK_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Status
            <select name="fstatus" defaultValue={statusFilter ?? ""} className="h-11 rounded-xl border border-border-input bg-background px-2 text-base">
              <option value="">All</option>
              {FEEDBACK_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {STATUS_LABELS[st]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="h-10 rounded-xl border border-border px-4 text-sm font-semibold hover:border-lagoon">
            Filter
          </button>
          {kindFilter || statusFilter ? (
            <Link href="/app/admin#feedback" className="h-10 px-2 text-sm leading-10 text-muted hover:text-foreground">
              Clear
            </Link>
          ) : null}
        </form>
        {feedback.error ? (
          <p className="text-sm text-muted">Feedback is not available yet ({feedback.error.code ?? "error"}).</p>
        ) : feedback.rows.length === 0 ? (
          <p className="text-sm text-muted">No feedback{kindFilter || statusFilter ? " matches" : " yet"}.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {feedback.rows.map((f) => (
              <li key={f.id} className="flex flex-col gap-2 rounded-2xl border border-border p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span className="font-semibold text-foreground">{KIND_LABELS[f.kind] ?? f.kind}</span>
                  <span className="whitespace-nowrap">{formatDateTime(f.created_at, "UTC")} UTC</span>
                  {isFeedbackStatus(f.status) ? <FeedbackStatusBadge status={f.status} /> : null}
                  {f.page ? <code>{f.page}</code> : null}
                  {f.app_version ? <span>v {f.app_version}</span> : null}
                  {f.contact_ok ? (
                    <span>OK to email{feedback.emails.get(f.user_id) ? `: ${feedback.emails.get(f.user_id)}` : ""}</span>
                  ) : null}
                </div>
                <p className="text-sm whitespace-pre-wrap break-words">{f.message}</p>
                <form action={setFeedbackStatus} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={f.id} />
                  <input type="hidden" name="back" value={filters.toString()} />
                  <label htmlFor={`status-${f.id}`} className="sr-only">
                    Status
                  </label>
                  <select id={`status-${f.id}`} name="status" defaultValue={f.status} className="h-11 rounded-xl border border-border-input bg-background px-2 text-base">
                    {FEEDBACK_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {STATUS_LABELS[st]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="h-10 rounded-xl border border-border px-3 text-sm font-semibold hover:border-lagoon"
                  >
                    Save
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="scan-reports" aria-labelledby="scan-reports-title" className="flex flex-col gap-3">
        <h2 id="scan-reports-title" className="text-xl font-semibold">
          Scan reports{reports.count !== null && reports.count !== undefined ? ` (${reports.count})` : ""}
        </h2>
        {reports.error ? (
          <p className="text-sm text-muted">Scan reports are not available yet ({reports.error.code ?? "error"}).</p>
        ) : reports.rows.length === 0 ? (
          <p className="text-sm text-muted">No misread reports yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {reports.rows.map((r) => {
              const url = r.photo_path ? reports.urls.get(r.photo_path) : undefined;
              return (
                <li key={r.id} className="flex flex-col gap-3 rounded-2xl border border-border p-4 sm:flex-row">
                  {r.photo_path ? (
                    url ? (
                      <a href={url} target="_blank" rel="noreferrer" className="shrink-0 self-start">
                        {/* A 5-minute signed URL from private storage. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="Shared scan photo" className="h-28 w-28 rounded-lg object-cover" />
                      </a>
                    ) : (
                      <span className="flex h-28 w-28 shrink-0 items-center justify-center rounded-lg bg-surface text-xs text-muted">
                        Photo unavailable
                      </span>
                    )
                  ) : null}
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span className="font-semibold text-foreground">{r.kind === "pump" ? "Pump schedule" : "Water test"}</span>
                      <span className="whitespace-nowrap">{formatDateTime(r.created_at, "UTC")} UTC</span>
                      <span>{REPORT_STATUS_LABELS[r.status] ?? r.status}</span>
                      {r.source ? <code>{r.source}</code> : null}
                      {r.prompt_version ? <span>reader {r.prompt_version}</span> : null}
                      {r.model ? <span>{r.model}</span> : null}
                      {!r.photo_path ? <span>no photo</span> : null}
                    </div>
                    <ul className="text-sm">
                      {reportLines(r.kind, r.read, r.corrected).map((l) => (
                        <li key={l.label}>
                          {l.label}: {l.read} → <strong>{l.corrected}</strong>
                        </li>
                      ))}
                    </ul>
                    {r.note ? <p className="text-sm whitespace-pre-wrap break-words">&ldquo;{r.note}&rdquo;</p> : null}
                    <div className="flex flex-wrap items-start gap-2">
                      <form action={setScanReportStatus} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={r.id} />
                        <label htmlFor={`report-status-${r.id}`} className="sr-only">
                          Status
                        </label>
                        <select
                          id={`report-status-${r.id}`}
                          name="status"
                          defaultValue={r.status}
                          className="h-10 rounded-xl border border-border-input bg-background px-2 text-sm"
                        >
                          {(["new", "reviewed", "fixed"] as const).map((st) => (
                            <option key={st} value={st}>
                              {REPORT_STATUS_LABELS[st]}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="h-10 rounded-xl border border-border px-3 text-sm font-semibold hover:border-lagoon">
                          Save
                        </button>
                      </form>
                      {r.photo_path ? (
                        <>
                          <ReadAgain id={r.id} />
                          <form action={deleteScanReportPhoto}>
                            <input type="hidden" name="id" value={r.id} />
                            <ConfirmButton
                              question="Delete this shared photo? The text report stays."
                              label="Delete photo"
                              text="Delete photo"
                              className="h-10 rounded-xl border border-border px-3 text-sm font-semibold text-red-700 hover:border-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40"
                            />
                          </form>
                        </>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-muted">
          Misread reports from photo scans: what the reader got, what the person changed it to, and the photo only when they
          ticked the box. Photos are deleted 12 months after sharing. Read again runs the current reader on the photo; it
          is not counted against anyone&apos;s scans and not stored.
        </p>
      </section>

      <section id="users" aria-labelledby="users-title" className="flex flex-col gap-3">
        <h2 id="users-title" className="text-xl font-semibold">
          Users{users ? ` (${users.length})` : ""}
        </h2>
        {!users ? (
          <p className="text-sm text-muted">The user list is not available right now. Check the server logs.</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted">No accounts yet.</p>
        ) : (
          <>
            <p className="text-sm text-muted">
              By source:{" "}
              {sourceCounts(users)
                .map((s) => `${s.source} ${s.count}`)
                .join(" · ")}
            </p>
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-surface text-left text-xs font-semibold text-muted">
                  <tr>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-3 py-3">Signed up</th>
                    <th className="px-3 py-3">Last sign-in</th>
                    <th className="px-3 py-3">Source</th>
                    <th className="px-3 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t border-border">
                      <td className="px-4 py-2.5">{u.email}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted">{formatDateTime(u.signedUpAt, "UTC")} UTC</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted">
                        {u.lastSignInAt ? `${formatDateTime(u.lastSignInAt, "UTC")} UTC` : "Not yet"}
                      </td>
                      <td className="px-3 py-2.5 text-muted">{u.source}</td>
                      <td className="px-3 py-1.5 text-right">
                        {deleteBlock(u, me, admins) ? (
                          <span className="text-xs text-muted">{deleteBlock(u, me, admins) === "self" ? "You" : "Admin"}</span>
                        ) : (
                          <form action={deleteUserAccount}>
                            <input type="hidden" name="id" value={u.id} />
                            <ConfirmButton
                              question={`Delete ${u.email} and all their pools, logs and feedback? This cannot be undone.`}
                              label={`Delete ${u.email}`}
                              text="Delete"
                              className="rounded-lg border border-border px-3 py-1.5 font-semibold text-red-700 hover:border-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40"
                            />
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted">
              Source is the ?ref= label of the link someone came through (kept from the waitlist when you invite them);
              &ldquo;invited&rdquo; means invited without one, &ldquo;direct&rdquo; signed up without one. Delete removes the
              account with its pools, logs and feedback, as the person&apos;s own Delete account does. Your own and other admins&apos; accounts have no Delete.
            </p>
          </>
        )}
      </section>

      <section id="links" aria-labelledby="links-title" className="flex flex-col gap-3">
        <h2 id="links-title" className="text-xl font-semibold">
          Links
        </h2>
        {!funnel ? (
          <p className="text-sm text-muted">Link counts are not available right now. Check the server logs.</p>
        ) : funnel.length === 0 ? (
          <p className="text-sm text-muted">No visits from a ?ref= link yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-surface text-left text-xs font-semibold text-muted">
                <tr>
                  <th className="px-4 py-3">Label</th>
                  <th className="px-3 py-3 text-right">Visits, {FUNNEL_DAYS} days</th>
                  <th className="px-3 py-3 text-right">Sign-ups</th>
                  <th className="px-3 py-3 text-right">Logged a test</th>
                </tr>
              </thead>
              <tbody>
                {funnel.map((r) => (
                  <tr key={r.label} className="border-t border-border">
                    <td className="px-4 py-2.5">{r.label}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.visits}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.signups}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.firstTests}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted">
          Visits are page loads from a link like tuffo.app/?ref=pools, counted per label and UTC day on the server; no
          address, cookie or browser detail is kept, so a person who opens the link twice counts twice. Bots and link
          previews are skipped. Sign-ups and tests are all time: accounts carrying the label, and how many of them have
          logged at least one test.
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-xl font-semibold">Invite someone</h2>
        <form action={inviteEmail} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="invite-email" className="sr-only">
            Email address
          </label>
          <input id="invite-email" name="email" type="email" required placeholder="name@example.com" className={input} />
          <button
            type="submit"
            className="h-11 rounded-xl bg-action px-4 text-sm font-semibold text-white hover:bg-action-deep"
          >
            Send invitation
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">
          Waitlist{count !== null && count !== undefined ? ` (${count})` : ""}
        </h2>
        {error ? (
          <p className="text-sm text-muted">The waitlist is not available yet ({error.code ?? "error"}).</p>
        ) : !entries || entries.length === 0 ? (
          <p className="text-sm text-muted">Nobody is waiting.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-surface text-left text-xs font-semibold text-muted">
                <tr>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-3 py-3">From</th>
                  <th className="px-3 py-3">Joined</th>
                  <th className="px-3 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.email} className="border-t border-border">
                    <td className="px-4 py-2.5">{entry.email}</td>
                    <td className="px-3 py-2.5 text-muted">{entry.source ?? "landing"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted">{formatDateTime(entry.created_at, "UTC")} UTC</td>
                    <td className="px-3 py-1.5">
                      <div className="flex justify-end gap-2">
                        <form action={inviteEmail}>
                          <input type="hidden" name="email" value={entry.email} />
                          <button
                            type="submit"
                            className="rounded-lg border border-border px-3 py-1.5 font-semibold hover:border-lagoon"
                          >
                            Invite
                          </button>
                        </form>
                        <form action={removeFromWaitlist}>
                          <input type="hidden" name="email" value={entry.email} />
                          <ConfirmButton question={`Remove ${entry.email} from the waitlist?`} label="Remove" />
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted">
          Export: in the Supabase SQL editor, <code>select email, source, created_at from waitlist order by created_at;</code>{" "}
          then Download CSV. Count by link: <code>select source, count(*) from waitlist group by source;</code>
        </p>
      </section>
    </>
  );
}
