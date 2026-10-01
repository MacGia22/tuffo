import { describe, expect, it } from "vitest";
import { parseRemoved, pickRestorable, removedToken } from "@/lib/removed";
import { parseSaved } from "@/lib/return-to";

const ID = "11111111-1111-4111-8111-111111111111";
const POOL = "22222222-2222-4222-8222-222222222222";

describe("removed", () => {
  it("round-trips the marker and keeps it apart from a save", () => {
    const token = removedToken("dose", ID);
    expect(parseRemoved(token)).toEqual({ kind: "dose", id: ID });
    expect(parseRemoved(`removed.reading.${ID}`)).toEqual({ kind: "reading", id: ID });
    expect(parseRemoved(`removed.pump.${ID}`)).toBeNull();
    expect(parseRemoved(`dose.${ID}`)).toBeNull();
    expect(parseRemoved("removed.dose.not-an-id")).toBeNull();
    expect(parseSaved(token)).toBe("saved");
  });

  it("puts back only the known columns", () => {
    const row = { id: ID, pool_id: POOL, added_at: "2026-09-30T10:00:00Z", product_id: "bleach-8", amount: 2000, unit: "mL", notes: null, owner_id: "x" };
    expect(pickRestorable("dose", row)).toEqual({
      id: ID,
      pool_id: POOL,
      added_at: "2026-09-30T10:00:00Z",
      product_id: "bleach-8",
      amount: 2000,
      unit: "mL",
      notes: null,
    });
  });

  it("refuses rows that are not rows of that kind", () => {
    expect(pickRestorable("dose", null)).toBeNull();
    expect(pickRestorable("pump", { id: ID, pool_id: POOL })).toBeNull();
    expect(pickRestorable("event", { id: "x", pool_id: POOL })).toBeNull();
    expect(pickRestorable("event", { id: ID, pool_id: POOL, notes: { nested: true } })).toBeNull();
  });

  it("keeps pressure readings with their clean flag", () => {
    const row = { id: ID, pool_id: POOL, read_on: "2026-09-30", kpa: 96.5, clean: true, created_at: "2026-09-30T10:00:00Z" };
    expect(pickRestorable("pressure", row)).toEqual(row);
  });
});
