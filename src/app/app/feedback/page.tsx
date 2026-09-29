import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/user";
import {
  feedbackPage,
  isFeedbackKind,
  isFeedbackStatus,
  KIND_LABELS,
  type FeedbackKind,
  type FeedbackStatus,
} from "@/lib/feedback";
import { formatDay } from "@/lib/format";
import { FeedbackStatusBadge } from "@/components/feedback-status";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FeedbackForm } from "./feedback-form";

export const metadata: Metadata = { title: "Feedback" };

interface Row {
  id: string;
  created_at: string;
  kind: FeedbackKind;
  message: string;
  status: FeedbackStatus;
}

export default async function FeedbackPage({ searchParams }: PageProps<"/app/feedback">) {
  await requireUser("/app/feedback");
  const { from } = await searchParams;
  const page = feedbackPage(typeof from === "string" ? from : null);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("feedback")
    .select("id, created_at, kind, message, status")
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<Row[]>();
  const past = (data ?? []).filter((r) => isFeedbackKind(r.kind) && isFeedbackStatus(r.status));

  return (
    <>
      <nav className="text-sm text-muted">
        <Link href="/app" className="hover:text-foreground">
          Your pools
        </Link>{" "}
        / Feedback
      </nav>
      <div>
        <h1 className="text-3xl font-semibold">Feedback</h1>
        <p className="text-muted">
          Ideas, problems and questions go straight to the developer. Each one gets a status here.
        </p>
      </div>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <FeedbackForm page={page} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">What you have sent</h2>
        {past.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {past.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 rounded-2xl border border-border p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span className="font-semibold text-foreground">{KIND_LABELS[r.kind]}</span>
                  <span>{formatDay(r.created_at, "UTC")}</span>
                  <FeedbackStatusBadge status={r.status} />
                </div>
                <p className="text-sm whitespace-pre-wrap break-words">{r.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
