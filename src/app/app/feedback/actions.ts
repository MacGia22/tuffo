"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { FEEDBACK_DAILY_LIMIT, validateFeedback } from "@/lib/feedback";
import { formFields } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface FeedbackState {
  error?: string;
  /** Set after a successful send; also resets the form. */
  sentAt?: number;
  fields?: Record<string, string>;
}

const LIMIT_MESSAGE = `That is ${FEEDBACK_DAILY_LIMIT} messages in the last 24 hours, the most Tuffo takes in a day. Try again tomorrow.`;

/**
 * Stores one message with the page it came from and the app version. Written with the
 * person's own session, so row-level security applies; the database also enforces the
 * daily limit, in case the count below races.
 */
export async function sendFeedback(_prev: FeedbackState, formData: FormData): Promise<FeedbackState> {
  const user = await requireUser("/app/feedback");
  const fields = formFields(formData);
  const checked = validateFeedback({
    kind: formData.get("kind"),
    message: formData.get("message"),
    page: formData.get("page"),
    contactOk: formData.get("contact_ok"),
  });
  if (!checked.ok) return { error: checked.error, fields };

  const supabase = await createSupabaseServerClient();
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { count } = await supabase
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);
  if ((count ?? 0) >= FEEDBACK_DAILY_LIMIT) return { error: LIMIT_MESSAGE, fields };

  const { kind, message, page, contactOk } = checked.value;
  const { error } = await supabase.from("feedback").insert({
    user_id: user.id,
    kind,
    message,
    page,
    app_version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    contact_ok: contactOk,
  });
  if (error) {
    if (error.hint === "feedback_daily_limit") return { error: LIMIT_MESSAGE, fields };
    console.error(`[feedback] insert failed: ${error.code ?? ""} ${error.message}`);
    return { error: "Could not send it. Try again in a moment.", fields };
  }

  revalidatePath("/app/feedback");
  return { sentAt: Date.now() };
}
