import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmButton } from "@/components/confirm-button";
import { requireAdmin } from "@/lib/auth/admin";
import { formatDateTime } from "@/lib/format";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { inviteEmail, removeFromWaitlist } from "./actions";

export const metadata: Metadata = { title: "Beta invites" };

const MESSAGES: Record<string, { text: string; error?: boolean }> = {
  invited: { text: "Invitation sent. The address has left the waitlist." },
  "already-user": { text: "That address already has an account; it has left the waitlist." },
  removed: { text: "Removed from the waitlist." },
  "bad-email": { text: "That email address does not look right.", error: true },
  "invite-failed": { text: "The invitation could not be sent. Check the Supabase logs.", error: true },
  "remove-failed": { text: "Could not remove it. Try again.", error: true },
};

interface Entry {
  email: string;
  source: string | null;
  created_at: string;
}

/** Private-beta admin: the waitlist, and invitations by email. Hidden (404) from everyone not in ADMIN_EMAILS. */
export default async function AdminPage({ searchParams }: PageProps<"/app/admin">) {
  await requireAdmin();
  const { status } = await searchParams;
  const message = typeof status === "string" ? MESSAGES[status] : undefined;

  const admin = createSupabaseAdminClient();
  const { data: entries, count, error } = await admin
    .from("waitlist")
    .select("email, source, created_at", { count: "exact" })
    .order("created_at", { ascending: true })
    .limit(200)
    .returns<Entry[]>();

  const input =
    "h-11 flex-1 rounded-xl border border-border bg-background px-3 text-base outline-none focus:border-lagoon focus:ring-2 focus:ring-lagoon/30";

  return (
    <>
      <nav className="text-sm text-muted">
        <Link href="/app" className="hover:text-foreground">
          Your pools
        </Link>{" "}
        / Beta invites
      </nav>
      <div>
        <h1 className="text-3xl font-semibold">Beta invites</h1>
        <p className="text-muted">
          Sign-ups stay closed; the people you invite here get an email that signs them in.
        </p>
      </div>

      {message ? (
        <p role="status" className={`text-sm ${message.error ? "text-red-600" : "text-muted"}`}>
          {message.text}
        </p>
      ) : null}

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-xl font-semibold">Invite someone</h2>
        <form action={inviteEmail} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="invite-email" className="sr-only">
            Email address
          </label>
          <input id="invite-email" name="email" type="email" required placeholder="name@example.com" className={input} />
          <button
            type="submit"
            className="h-11 rounded-xl bg-lagoon px-4 text-sm font-semibold text-white hover:bg-lagoon-deep"
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
              <thead className="bg-surface text-left text-xs uppercase tracking-wider text-muted">
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
