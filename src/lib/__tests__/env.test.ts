import { describe, expect, it } from "vitest";
import { asBaseUrl } from "../env";

describe("asBaseUrl", () => {
  it("passes a full URL through", () => {
    expect(asBaseUrl("https://abcdefghijklmnopqrst.supabase.co")).toBe(
      "https://abcdefghijklmnopqrst.supabase.co",
    );
  });

  it("drops trailing slashes", () => {
    expect(asBaseUrl("https://tuffo.app/")).toBe("https://tuffo.app");
    expect(asBaseUrl("https://tuffo.app///")).toBe("https://tuffo.app");
  });

  it("adds https:// to a bare host", () => {
    expect(asBaseUrl("abcdefghijklmnopqrst.supabase.co")).toBe(
      "https://abcdefghijklmnopqrst.supabase.co",
    );
    expect(asBaseUrl("abcdefghijklmnopqrst.supabase.co/")).toBe(
      "https://abcdefghijklmnopqrst.supabase.co",
    );
  });

  it("keeps an explicit scheme", () => {
    expect(asBaseUrl("http://localhost:54321")).toBe("http://localhost:54321");
  });

  it("returns undefined for nothing", () => {
    expect(asBaseUrl(undefined)).toBeUndefined();
    expect(asBaseUrl("")).toBeUndefined();
  });
});
