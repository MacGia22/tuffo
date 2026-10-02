import { describe, expect, it } from "vitest";
import { poolLocalDate } from "../maintenance-data";

describe("poolLocalDate", () => {
  it("gives the pool's date, and UTC's for a zone it does not know", () => {
    const now = Date.parse("2026-10-02T03:00:00Z");
    expect(poolLocalDate("America/Los_Angeles", now)).toBe("2026-10-01");
    expect(poolLocalDate(null, now)).toBe("2026-10-02");
    // One bad row must not stop the alert job for everyone.
    expect(poolLocalDate("Not/A_Zone", now)).toBe("2026-10-02");
  });
});
