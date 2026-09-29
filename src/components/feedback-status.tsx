import { STATUS_LABELS, type FeedbackStatus } from "@/lib/feedback";

/** A feedback status as a small pill. */
export function FeedbackStatusBadge({ status }: { status: FeedbackStatus }) {
  const tone =
    status === "done"
      ? "border-lagoon text-lagoon-deep"
      : status === "planned"
        ? "border-sun text-foreground"
        : "border-border text-muted";
  return <span className={`rounded-full border px-2 py-0.5 ${tone}`}>{STATUS_LABELS[status]}</span>;
}
