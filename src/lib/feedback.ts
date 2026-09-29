/**
 * In-app feedback: the kinds and statuses, validation of what a person sends, and the
 * page it was sent from. Pure; the database enforces the same limits.
 */

export const FEEDBACK_KINDS = ["idea", "problem", "question", "other"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_STATUSES = ["new", "planned", "done", "declined"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const KIND_LABELS: Record<FeedbackKind, string> = {
  idea: "Idea",
  problem: "Problem",
  question: "Question",
  other: "Other",
};

export const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "New",
  planned: "Planned",
  done: "Done",
  declined: "Not planned",
};

export const FEEDBACK_MAX_CHARS = 2000;
/** Messages per person in any 24 hours; the database trigger enforces the same number. */
export const FEEDBACK_DAILY_LIMIT = 10;
const PAGE_MAX_CHARS = 200;

export function isFeedbackKind(value: unknown): value is FeedbackKind {
  return typeof value === "string" && (FEEDBACK_KINDS as readonly string[]).includes(value);
}

export function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return typeof value === "string" && (FEEDBACK_STATUSES as readonly string[]).includes(value);
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * The app path feedback was sent from, or null. Only paths inside the app are kept, with
 * no query string, and ids replaced by "[id]" so a pool is never identified.
 */
export function feedbackPage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim().split(/[?#]/)[0];
  if (!/^\/app(\/[A-Za-z0-9._~\-/]*)?$/.test(path) || path.includes("//")) return null;
  const page = path.replace(UUID, "[id]");
  return page.length <= PAGE_MAX_CHARS ? page : null;
}

/** Message length as the database counts it (characters, not UTF-16 units). */
export function messageLength(message: string): number {
  return [...message].length;
}

export interface FeedbackInput {
  kind: FeedbackKind;
  message: string;
  page: string | null;
  contactOk: boolean;
}

export type FeedbackValidation = { ok: true; value: FeedbackInput } | { ok: false; error: string };

export function validateFeedback(raw: {
  kind: unknown;
  message: unknown;
  page?: unknown;
  contactOk?: unknown;
}): FeedbackValidation {
  if (!isFeedbackKind(raw.kind)) return { ok: false, error: "Choose what kind of feedback this is." };
  const message = typeof raw.message === "string" ? raw.message.replace(/\r\n/g, "\n").trim() : "";
  if (!message) return { ok: false, error: "Write a message first." };
  const length = messageLength(message);
  if (length > FEEDBACK_MAX_CHARS) {
    return { ok: false, error: `Keep it under ${FEEDBACK_MAX_CHARS} characters (now ${length}).` };
  }
  return {
    ok: true,
    value: {
      kind: raw.kind,
      message,
      page: feedbackPage(raw.page),
      contactOk: raw.contactOk === true || raw.contactOk === "on" || raw.contactOk === "true",
    },
  };
}

/** The link to the feedback page, remembering where the person came from. */
export function feedbackHref(from?: string | null): string {
  const page = feedbackPage(from);
  return page && page !== "/app/feedback" ? `/app/feedback?from=${encodeURIComponent(page)}` : "/app/feedback";
}
