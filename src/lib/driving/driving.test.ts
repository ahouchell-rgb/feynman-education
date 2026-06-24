import { describe, it, expect } from "vitest";
import { QUESTIONS, QUESTIONS_BY_CATEGORY } from "./questions";
import { CATEGORIES } from "./categories";
import { buildMockTest, THEORY_TOTAL } from "./mock";
import { scoreHazard, detectCheat } from "./hazardScore";
import { HAZARD_CLIPS } from "./hazardClips";

describe("question bank integrity", () => {
  it("has questions and every one is well-formed", () => {
    expect(QUESTIONS.length).toBeGreaterThan(100);
    const ids = new Set<string>();
    for (const q of QUESTIONS) {
      expect(q.id, "id").toBeTruthy();
      expect(ids.has(q.id), `duplicate id ${q.id}`).toBe(false);
      ids.add(q.id);
      expect(q.options.length, q.id).toBeGreaterThanOrEqual(2);
      expect(q.correct.length, q.id).toBe(q.selectCount);
      for (const c of q.correct) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThan(q.options.length);
      }
      expect(q.explanation.length, q.id).toBeGreaterThan(0);
    }
  });

  it("covers all 14 official categories", () => {
    for (const c of CATEGORIES) {
      expect((QUESTIONS_BY_CATEGORY[c.id] ?? []).length, c.id).toBeGreaterThan(0);
    }
  });
});

describe("buildMockTest", () => {
  it("returns the requested number of unique questions spread across topics", () => {
    const test = buildMockTest(THEORY_TOTAL);
    expect(test.length).toBe(THEORY_TOTAL);
    const ids = new Set(test.map((q) => q.id));
    expect(ids.size).toBe(THEORY_TOTAL);
    const cats = new Set(test.map((q) => q.category));
    expect(cats.size).toBeGreaterThanOrEqual(10); // good spread
  });
});

describe("scoreHazard", () => {
  // window 7..12 => bands of 1s: [7,8)=5, [8,9)=4, [9,10)=3, [10,11)=2, [11,12]=1
  it("scores earlier clicks higher", () => {
    expect(scoreHazard(7, 12, [7.2])).toBe(5);
    expect(scoreHazard(7, 12, [8.5])).toBe(4);
    expect(scoreHazard(7, 12, [11.5])).toBe(1);
  });
  it("ignores clicks outside the window", () => {
    expect(scoreHazard(7, 12, [3, 6.9, 13])).toBe(0);
  });
  it("takes the best qualifying click", () => {
    expect(scoreHazard(7, 12, [11.5, 7.1, 9.5])).toBe(5);
  });
});

describe("detectCheat", () => {
  it("passes normal clicking", () => {
    expect(detectCheat([7.3])).toBe(false);
    expect(detectCheat([6.5, 8.1, 11.0])).toBe(false);
  });
  it("flags excessive clicking", () => {
    expect(detectCheat(Array.from({ length: 13 }, (_, i) => i * 0.7))).toBe(true);
  });
  it("flags steady-rhythm clicking", () => {
    expect(detectCheat([1, 2, 3, 4, 5, 6, 7, 8])).toBe(true);
  });
});

describe("hazard clips", () => {
  it("each clip has at least one hazard with a valid scoring window", () => {
    for (const clip of HAZARD_CLIPS) {
      expect(clip.hazards.length).toBeGreaterThan(0);
      for (const h of clip.hazards) {
        expect(h.windowStart).toBeLessThan(h.windowEnd);
        expect(h.windowEnd).toBeLessThanOrEqual(clip.duration);
      }
    }
  });
});
