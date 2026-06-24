import { describe, it, expect } from "vitest";
import { QUESTIONS, QUESTIONS_BY_CATEGORY } from "./questions";
import { CATEGORIES } from "./categories";
import { buildMockTest, THEORY_TOTAL } from "./mock";
import { scoreHazardClick, tooManyFalseAlarms, HAZARD_CLIPS, MAX_PER_HAZARD } from "./hazardSim";

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

describe("scoreHazardClick", () => {
  // window develops 5..7.5
  it("gives full marks for clicking before/at the window opens", () => {
    expect(scoreHazardClick(5, 7.5, 4.5)).toBe(5);
    expect(scoreHazardClick(5, 7.5, 5)).toBe(5);
  });
  it("scores earlier clicks within the window higher", () => {
    expect(scoreHazardClick(5, 7.5, 5.2)).toBeGreaterThan(scoreHazardClick(5, 7.5, 7.2));
  });
  it("scores 0 after the hazard has occurred", () => {
    expect(scoreHazardClick(5, 7.5, 8)).toBe(0);
  });
  it("stays within 1..MAX inside the window", () => {
    for (let tc = 5.01; tc < 7.5; tc += 0.1) {
      const s = scoreHazardClick(5, 7.5, tc);
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(MAX_PER_HAZARD);
    }
  });
});

describe("tooManyFalseAlarms", () => {
  it("allows a few genuine reactions", () => {
    expect(tooManyFalseAlarms([])).toBe(false);
    expect(tooManyFalseAlarms([2.1, 5.4])).toBe(false);
  });
  it("flags excessive clicking", () => {
    expect(tooManyFalseAlarms(Array.from({ length: 11 }, (_, i) => i * 0.6))).toBe(true);
  });
  it("flags steady-rhythm mashing", () => {
    expect(tooManyFalseAlarms([1, 2, 3, 4, 5, 6])).toBe(true);
  });
});

describe("hazard clips", () => {
  it("each clip has valid hazards whose window sits inside the clip", () => {
    for (const clip of HAZARD_CLIPS) {
      expect(clip.hazards.length).toBeGreaterThan(0);
      for (const h of clip.hazards) {
        expect(h.developStart).toBeLessThan(h.developEnd);
        expect(h.appearAt).toBeLessThanOrEqual(h.developStart);
        expect(h.developEnd).toBeLessThanOrEqual(clip.duration);
      }
    }
  });
});
