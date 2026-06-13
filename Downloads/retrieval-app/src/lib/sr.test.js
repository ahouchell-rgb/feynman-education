import { describe, it, expect } from "vitest";
import { nextSR } from "./sr.js";

const daysFromNow = (iso) => Math.round((new Date(iso) - Date.now()) / 86_400_000);

describe("nextSR (SM-2 scheduling)", () => {
  it("first correct answer: reps 1, interval 1 day, ef nudged up", () => {
    const r = nextSR(true, {}); // fresh card
    expect(r.reps).toBe(1);
    expect(r.iv).toBe(1);
    expect(r.ef).toBeCloseTo(2.6, 5);
    expect(daysFromNow(r.due)).toBe(1);
  });

  it("second consecutive correct: interval jumps to 3 days", () => {
    const r = nextSR(true, { ef: 2.6, iv: 1, reps: 1 });
    expect(r.reps).toBe(2);
    expect(r.iv).toBe(3);
    expect(r.ef).toBeCloseTo(2.7, 5);
    expect(daysFromNow(r.due)).toBe(3);
  });

  it("third+ correct: interval = round(prev interval * OLD ef)", () => {
    const r = nextSR(true, { ef: 2.7, iv: 3, reps: 2 });
    expect(r.reps).toBe(3);
    expect(r.iv).toBe(8); // round(3 * 2.7) = 8, using ef BEFORE the +0.1 bump
    expect(r.ef).toBeCloseTo(2.8, 5);
    expect(daysFromNow(r.due)).toBe(8);
  });

  it("incorrect answer resets reps & interval and lowers ef", () => {
    const r = nextSR(false, { ef: 2.5, iv: 8, reps: 4 });
    expect(r.reps).toBe(0);
    expect(r.iv).toBe(0);
    expect(r.ef).toBeCloseTo(2.3, 5);
    expect(daysFromNow(r.due)).toBe(0); // due immediately
  });

  it("ease factor never drops below the 1.3 floor", () => {
    let prev = { ef: 1.4, iv: 0, reps: 0 };
    for (let i = 0; i < 5; i++) prev = nextSR(false, prev);
    expect(prev.ef).toBe(1.3);
  });
});
