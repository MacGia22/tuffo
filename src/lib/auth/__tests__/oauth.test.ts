import { describe, expect, it } from "vitest";
import { loginError, oauthErrorKind } from "../oauth";

describe("oauthErrorKind", () => {
  it("is nothing without an error", () => {
    expect(oauthErrorKind(null, null)).toBeNull();
  });

  it("tells the private beta apart", () => {
    expect(oauthErrorKind("access_denied", "Signups not allowed for this instance")).toBe("beta");
    expect(oauthErrorKind("server_error", "Signups not allowed for otp")).toBe("beta");
  });

  it("reports any other provider error as a Google problem", () => {
    expect(oauthErrorKind("access_denied", "The user denied access")).toBe("google");
    expect(oauthErrorKind("server_error", null)).toBe("google");
  });
});

describe("loginError", () => {
  it("accepts only the values Tuffo sets", () => {
    expect(loginError("beta")).toBe("beta");
    expect(loginError("link")).toBe("link");
    expect(loginError("google")).toBe("google");
    expect(loginError("<script>")).toBeNull();
    expect(loginError(undefined)).toBeNull();
  });
});
