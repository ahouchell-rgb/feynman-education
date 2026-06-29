import { describe, it, expect, beforeEach, vi } from "vitest";
import { guestWrite, guestRead, GUEST_KEY, GuestQuotaError, isQuotaError } from "./guestDecks";

describe("isQuotaError", () => {
  it("recognises the various over-quota signals", () => {
    expect(isQuotaError({ name: "QuotaExceededError" })).toBe(true);
    expect(isQuotaError({ name: "NS_ERROR_DOM_QUOTA_REACHED" })).toBe(true);
    expect(isQuotaError({ code: 22 })).toBe(true);
    expect(isQuotaError({ code: 1014 })).toBe(true);
  });
  it("ignores unrelated errors and nullish values", () => {
    expect(isQuotaError(new Error("network"))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
    expect(isQuotaError(undefined)).toBe(false);
  });
});

describe("guestWrite quota handling", () => {
  beforeEach(() => { localStorage.clear(); });

  it("persists decks normally", () => {
    guestWrite([{ id: "d1", title: "Deck" }]);
    expect(guestRead()).toEqual([{ id: "d1", title: "Deck" }]);
  });

  it("throws GuestQuotaError on an over-quota write without clobbering existing storage", () => {
    guestWrite([{ id: "d1", title: "Existing" }]);
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      const err: any = new Error("quota"); err.name = "QuotaExceededError"; throw err;
    });
    expect(() => guestWrite([{ id: "d2", title: "Huge" }])).toThrow(GuestQuotaError);
    spy.mockRestore();
    // The previously-stored decks are untouched.
    expect(localStorage.getItem(GUEST_KEY)).toContain("Existing");
  });

  it("rethrows non-quota errors as-is", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("boom"); });
    expect(() => guestWrite([{ id: "d3" }])).toThrow("boom");
    spy.mockRestore();
  });
});
