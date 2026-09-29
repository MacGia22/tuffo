import { describe, expect, it } from "vitest";
import {
  feedbackHref,
  feedbackPage,
  isFeedbackStatus,
  messageLength,
  validateFeedback,
} from "../feedback";

describe("feedbackPage", () => {
  it("keeps app paths and hides ids", () => {
    expect(feedbackPage("/app")).toBe("/app");
    expect(feedbackPage("/app/account")).toBe("/app/account");
    expect(feedbackPage("/app/pools/0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d/readings/new")).toBe(
      "/app/pools/[id]/readings/new",
    );
  });

  it("drops the query string and hash", () => {
    expect(feedbackPage("/app/admin?status=invited#x")).toBe("/app/admin");
  });

  it("refuses anything outside the app", () => {
    expect(feedbackPage("/privacy")).toBeNull();
    expect(feedbackPage("https://evil.example/app")).toBeNull();
    expect(feedbackPage("//evil.example/app")).toBeNull();
    expect(feedbackPage("/app//x")).toBeNull();
    expect(feedbackPage("/application")).toBeNull();
    expect(feedbackPage("/app/<script>")).toBeNull();
    expect(feedbackPage(`/app/${"a".repeat(300)}`)).toBeNull();
    expect(feedbackPage(undefined)).toBeNull();
  });
});

describe("validateFeedback", () => {
  it("accepts a message and trims it", () => {
    const result = validateFeedback({ kind: "idea", message: "  Add a salt chart \r\n", page: "/app", contactOk: "on" });
    expect(result).toEqual({
      ok: true,
      value: { kind: "idea", message: "Add a salt chart", page: "/app", contactOk: true },
    });
  });

  it("needs a known kind", () => {
    expect(validateFeedback({ kind: "praise", message: "Nice" })).toEqual({
      ok: false,
      error: "Choose what kind of feedback this is.",
    });
  });

  it("needs a message", () => {
    expect(validateFeedback({ kind: "problem", message: "   " }).ok).toBe(false);
    expect(validateFeedback({ kind: "problem", message: null }).ok).toBe(false);
  });

  it("allows exactly 2000 characters, counting emoji as one", () => {
    expect(validateFeedback({ kind: "other", message: "a".repeat(2000) }).ok).toBe(true);
    expect(validateFeedback({ kind: "other", message: "🏊".repeat(2000) }).ok).toBe(true);
    const long = validateFeedback({ kind: "other", message: "a".repeat(2001) });
    expect(long).toEqual({ ok: false, error: "Keep it under 2000 characters (now 2001)." });
  });

  it("treats a missing checkbox as no contact", () => {
    const result = validateFeedback({ kind: "question", message: "Why?", contactOk: null });
    expect(result.ok && result.value.contactOk).toBe(false);
  });

  it("drops a page from outside the app", () => {
    const result = validateFeedback({ kind: "question", message: "Why?", page: "https://example.com" });
    expect(result.ok && result.value.page).toBeNull();
  });
});

describe("messageLength", () => {
  it("counts characters, not UTF-16 units", () => {
    expect("🏊".length).toBe(2);
    expect(messageLength("🏊 ok")).toBe(4);
  });
});

describe("isFeedbackStatus", () => {
  it("knows the four statuses", () => {
    for (const s of ["new", "planned", "done", "declined"]) expect(isFeedbackStatus(s)).toBe(true);
    expect(isFeedbackStatus("closed")).toBe(false);
  });
});

describe("feedbackHref", () => {
  it("carries the page it came from", () => {
    expect(feedbackHref("/app/pools/0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d")).toBe(
      "/app/feedback?from=%2Fapp%2Fpools%2F%5Bid%5D",
    );
  });

  it("is plain from the feedback page itself or from nowhere", () => {
    expect(feedbackHref("/app/feedback")).toBe("/app/feedback");
    expect(feedbackHref(null)).toBe("/app/feedback");
  });
});
