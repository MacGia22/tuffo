import { describe, expect, it, vi } from "vitest";
import { failed, SAVE_FAILED } from "../errors";

describe("failed", () => {
  it("logs the detail and shows plain words", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(failed("settings", 'new row violates check constraint "pools_volume_check"')).toBe(SAVE_FAILED);
    expect(log).toHaveBeenCalledWith('[settings] new row violates check constraint "pools_volume_check"');
    log.mockRestore();
  });
});
