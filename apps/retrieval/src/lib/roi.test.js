import { describe, it, expect } from "vitest";
import { markingTimeSaved, SECONDS_PER_MARK } from "./roi.js";

describe("SECONDS_PER_MARK", () => {
  it("is the conservative 20s-per-mark estimate the UI depends on", () => {
    expect(SECONDS_PER_MARK).toBe(20);
  });
});

describe("markingTimeSaved", () => {
  it("treats zero marked responses as zero everything", () => {
    const r = markingTimeSaved(0);
    expect(r.responsesMarked).toBe(0);
    expect(r.seconds).toBe(0);
    expect(r.hours).toBe(0);
    expect(r.label).toBe("0 min");
  });

  it("clamps negative / nullish counts to zero", () => {
    expect(markingTimeSaved(-50).responsesMarked).toBe(0);
    expect(markingTimeSaved(null).responsesMarked).toBe(0);
    expect(markingTimeSaved(undefined).responsesMarked).toBe(0);
    expect(markingTimeSaved(undefined).label).toBe("0 min");
  });

  it("computes seconds as count × SECONDS_PER_MARK", () => {
    const r = markingTimeSaved(9);
    expect(r.seconds).toBe(180); // 9 * 20
    expect(r.hours).toBeCloseTo(180 / 3600, 10);
  });

  it("formats sub-hour savings in rounded minutes", () => {
    // 9 marks = 180s = 3 min
    expect(markingTimeSaved(9).label).toBe("3 min");
    // 100 marks = 2000s = 33.3 min -> rounds to 33
    expect(markingTimeSaved(100).label).toBe("33 min");
  });

  it("just below the 1-hour boundary still reads in minutes", () => {
    // n=179 -> 3580s -> hours 0.994 (<1) -> Math.round(3580/60)=60 min
    const r = markingTimeSaved(179);
    expect(r.hours).toBeLessThan(1);
    expect(r.label).toBe("60 min");
  });

  it("at exactly one hour switches to the hours label", () => {
    // n=180 -> 3600s -> hours exactly 1 (not < 1) -> "1.0 hours"
    const r = markingTimeSaved(180);
    expect(r.hours).toBe(1);
    expect(r.label).toBe("1.0 hours");
  });

  it("formats mid-range savings as one-decimal hours", () => {
    // n=900 -> 18000s -> 5 hours
    expect(markingTimeSaved(900).label).toBe("5.0 hours");
  });

  it("just below the 2-day boundary still reads in hours", () => {
    // boundary is seconds < SECONDS_PER_DAY*2 = 43200 -> n < 2160
    const r = markingTimeSaved(2159); // 43180s
    expect(r.seconds).toBe(43180);
    expect(r.label).toBe("12.0 hours"); // 43180/3600 = 11.99 -> toFixed(1) = 12.0
  });

  it("at the 2-day boundary switches to the days label", () => {
    // n=2160 -> 43200s = exactly 2 days; seconds is NOT < 43200 -> days branch
    const r = markingTimeSaved(2160);
    expect(r.seconds).toBe(43200);
    expect(r.label).toBe("2.0 days"); // 43200 / 21600 = 2.0
  });

  it("formats large savings in days (6h = one marking day)", () => {
    // n=10800 -> 216000s -> 216000/21600 = 10 days
    expect(markingTimeSaved(10800).label).toBe("10.0 days");
  });

  it("carries an estimate footnote with the locale-formatted count", () => {
    const r = markingTimeSaved(12345);
    expect(r.footnote).toContain("12,345");
    expect(r.footnote).toContain("20s");
    expect(r.footnote).toMatch(/6h/);
    expect(r.footnote).toMatch(/indicative/i);
  });
});
