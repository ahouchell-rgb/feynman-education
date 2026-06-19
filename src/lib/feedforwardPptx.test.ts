import { describe, it, expect } from "vitest";
// CommonJS module — import the layout-maths helpers exported for testing.
import { estLines, boxHeight, CPI } from "./feedforwardPptx.js";

// At width 1.3in, (w - 0.3) * CPI = 1.0 * 17 = 17 chars per line — a clean boundary.
const W = 1.3;

describe("estLines — text-wrapping estimate for an activity line", () => {
  it("never returns less than one line, even for empty text", () => {
    expect(estLines("", W)).toBe(1);
    expect(estLines("hi", W)).toBe(1);
  });
  it("fits exactly CPI-derived chars on one line, wrapping on the next char", () => {
    expect(estLines("x".repeat(17), W)).toBe(1);
    expect(estLines("x".repeat(18), W)).toBe(2);
    expect(estLines("x".repeat(34), W)).toBe(2);
    expect(estLines("x".repeat(35), W)).toBe(3);
  });
  it("wraps more on a narrower box", () => {
    const wide = estLines("x".repeat(100), 5);
    const narrow = estLines("x".repeat(100), 2);
    expect(narrow).toBeGreaterThan(wide);
  });
  it("guards against zero/negative effective width (always ≥1 char per line)", () => {
    // w so small that (w-0.3)*CPI < 1 — the inner Math.max(1, …) prevents /0.
    expect(estLines("abc", 0.3)).toBe(3);
  });
});

describe("boxHeight — total height of an activity box", () => {
  const act = (lines: string[], wordbank?: string) => ({ title: "T", wordbank, lines });

  it("grows with more lines", () => {
    const one = boxHeight(act(["a"]), W);
    const three = boxHeight(act(["a", "b", "c"]), W);
    expect(three).toBeGreaterThan(one);
  });
  it("a word bank adds height", () => {
    expect(boxHeight(act(["a"], "x, y, z"), W)).toBeGreaterThan(boxHeight(act(["a"]), W));
  });
  it("a longer (wrapping) line is taller than a short one", () => {
    expect(boxHeight(act(["x".repeat(60)]), W)).toBeGreaterThan(boxHeight(act(["x"]), W));
  });
  it("returns a positive finite height", () => {
    const h = boxHeight(act(["a", "b"]), W);
    expect(h).toBeGreaterThan(0);
    expect(Number.isFinite(h)).toBe(true);
  });
});

describe("CPI constant", () => {
  it("is the documented 17 characters-per-inch estimate", () => {
    expect(CPI).toBe(17);
  });
});
