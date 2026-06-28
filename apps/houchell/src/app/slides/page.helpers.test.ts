import { describe, it, expect, vi } from "vitest";
import { hasUnsavedWork, readUpdatedAtWithRetry, retryDelayMs } from "./saveHelpers";

describe("hasUnsavedWork (beforeunload guard predicate)", () => {
  it("warns while a save is in flight or has failed", () => {
    expect(hasUnsavedWork({ save: "saving", pendingTimer: false })).toBe(true);
    expect(hasUnsavedWork({ save: "error", pendingTimer: false })).toBe(true);
  });
  it("warns while a debounced save is still pending", () => {
    expect(hasUnsavedWork({ save: "saved", pendingTimer: true })).toBe(true);
  });
  it("does not warn when everything is saved and nothing is pending", () => {
    expect(hasUnsavedWork({ save: "saved", pendingTimer: false })).toBe(false);
  });
});

describe("readUpdatedAtWithRetry (conflict-check must not fail open)", () => {
  it("returns the value on first success", async () => {
    const read = vi.fn().mockResolvedValue({ updated_at: "2026-01-01T00:00:00Z" });
    const r = await readUpdatedAtWithRetry(read, 3);
    expect(r).toEqual({ ok: true, updatedAt: "2026-01-01T00:00:00Z" });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("retries a transient failure and then succeeds", async () => {
    const read = vi.fn()
      .mockRejectedValueOnce(new Error("net"))
      .mockResolvedValueOnce({ updated_at: "ts" });
    const r = await readUpdatedAtWithRetry(read, 3);
    expect(r).toEqual({ ok: true, updatedAt: "ts" });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("reports ok=false when every attempt fails (so the caller won't clobber)", async () => {
    const read = vi.fn().mockRejectedValue(new Error("net"));
    const r = await readUpdatedAtWithRetry(read, 3);
    expect(r).toEqual({ ok: false, updatedAt: null });
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("treats a missing updated_at as null but still ok", async () => {
    const read = vi.fn().mockResolvedValue(null);
    const r = await readUpdatedAtWithRetry(read, 2);
    expect(r).toEqual({ ok: true, updatedAt: null });
  });
});

describe("retryDelayMs (autosave backoff)", () => {
  it("grows exponentially from the base", () => {
    expect(retryDelayMs(0, 1500)).toBe(1500);
    expect(retryDelayMs(1, 1500)).toBe(3000);
    expect(retryDelayMs(2, 1500)).toBe(6000);
  });
  it("is capped", () => {
    expect(retryDelayMs(20, 1500, 30000)).toBe(30000);
  });
});
