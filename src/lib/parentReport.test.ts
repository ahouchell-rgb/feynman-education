import { describe, it, expect } from "vitest";
import { weekStartISO, weekLabel } from "./parentReport.js";

describe("weekStartISO", () => {
  it("returns the Monday of the week (mid-week input)", () => {
    // 2026-06-17 is a Wednesday → Monday is 2026-06-15.
    expect(weekStartISO(new Date("2026-06-17T09:00:00"))).toBe("2026-06-15");
  });
  it("returns the same day when given a Monday", () => {
    expect(weekStartISO(new Date("2026-06-15T12:00:00"))).toBe("2026-06-15");
  });
  it("treats Sunday as the end of the week, not the start", () => {
    // 2026-06-21 is a Sunday → its week's Monday is 2026-06-15.
    expect(weekStartISO(new Date("2026-06-21T23:00:00"))).toBe("2026-06-15");
  });
});

describe("weekLabel", () => {
  it("formats a week-start ISO date in UK long form", () => {
    expect(weekLabel("2026-06-15")).toBe("15 June 2026");
  });
});
