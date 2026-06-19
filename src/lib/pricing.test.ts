import { describe, it, expect } from "vitest";
import { costGBP, todayISO, RATES, GBP_PER_USD } from "./pricing.js";

describe("costGBP — the per-teacher daily-spend backstop maths", () => {
  it("is zero for zero tokens", () => {
    expect(costGBP(0, 0, RATES.sonnet)).toBe(0);
    expect(costGBP(0, 0, RATES.opus)).toBe(0);
  });
  it("prices Sonnet input at $3 and output at $15 per Mtok, in GBP", () => {
    // 1M input tokens = $3 → £3 * 0.79
    expect(costGBP(1e6, 0, RATES.sonnet)).toBeCloseTo(3 * GBP_PER_USD, 10);
    expect(costGBP(0, 1e6, RATES.sonnet)).toBeCloseTo(15 * GBP_PER_USD, 10);
  });
  it("prices Opus higher than Sonnet for the same tokens", () => {
    expect(costGBP(1e6, 1e6, RATES.opus)).toBeGreaterThan(costGBP(1e6, 1e6, RATES.sonnet));
    expect(costGBP(1e6, 0, RATES.opus)).toBeCloseTo(5 * GBP_PER_USD, 10);
    expect(costGBP(0, 1e6, RATES.opus)).toBeCloseTo(25 * GBP_PER_USD, 10);
  });
  it("scales linearly and sums input + output", () => {
    const a = costGBP(500_000, 0, RATES.sonnet);
    const b = costGBP(0, 200_000, RATES.sonnet);
    expect(costGBP(500_000, 200_000, RATES.sonnet)).toBeCloseTo(a + b, 12);
    expect(costGBP(2e6, 0, RATES.sonnet)).toBeCloseTo(2 * costGBP(1e6, 0, RATES.sonnet), 12);
  });
});

describe("todayISO — the daily-usage bucket key", () => {
  it("formats a date as yyyy-mm-dd (UTC)", () => {
    expect(todayISO(new Date("2026-06-19T13:45:00Z"))).toBe("2026-06-19");
  });
  it("uses the UTC calendar day, not local time", () => {
    // 23:30 UTC is still the 19th in UTC regardless of the runner's timezone.
    expect(todayISO(new Date("2026-06-19T23:30:00Z"))).toBe("2026-06-19");
  });
  it("defaults to now when called with no argument", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
