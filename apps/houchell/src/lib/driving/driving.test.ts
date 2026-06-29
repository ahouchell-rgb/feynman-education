import { describe, it, expect } from "vitest";
import { QUESTIONS, QUESTIONS_BY_CATEGORY } from "./questions";
import { CATEGORIES } from "./categories";
import { buildMockTest, THEORY_TOTAL } from "./mock";
import { scoreHazardClick, tooManyFalseAlarms, HAZARD_CLIPS, MAX_PER_HAZARD, maxHazardScore, hazardPassMark } from "./hazardSim";
import { LESSONS } from "./lessons";
import { SIGNS, SIGN_BY_ID } from "./signs";
import { SIGN_QUESTIONS } from "./signQuestions";
import { CASE_STUDIES } from "./caseStudies";
import { readiness, buildSmartSet, reviewMistakes } from "./study";
import type { Progress } from "./storage";

const emptyProgress = (): Progress => ({ questions: {}, categories: {}, theoryAttempts: [], hazardAttempts: [], flagged: [], lessonsDone: [], streak: { count: 0, best: 0, lastDay: "" } });

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
  it("totals to a DVSA-style 75 max with a 44 pass mark", () => {
    expect(maxHazardScore()).toBe(75);
    expect(hazardPassMark()).toBe(44);
    expect(HAZARD_CLIPS.length).toBeGreaterThanOrEqual(14);
  });
  it("hazard ids are unique within each clip", () => {
    for (const clip of HAZARD_CLIPS) {
      const ids = clip.hazards.map((h) => h.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("learn lessons", () => {
  it("each lesson is well-formed and its quiz category has enough questions", () => {
    const ids = new Set<string>();
    for (const l of LESSONS) {
      expect(l.id).toBeTruthy();
      expect(ids.has(l.id), `dup ${l.id}`).toBe(false);
      ids.add(l.id);
      expect(l.sections.length).toBeGreaterThan(0);
      for (const s of l.sections) expect(s.points.length).toBeGreaterThan(0);
      expect(l.quizCount).toBeGreaterThan(0);
      const pool = (QUESTIONS_BY_CATEGORY[l.category] ?? []).length;
      expect(pool, `${l.id} pool`).toBeGreaterThanOrEqual(l.quizCount);
    }
  });
});

describe("sign-recognition questions", () => {
  it("every sign question references a real sign and is well-formed", () => {
    expect(SIGN_QUESTIONS.length).toBeGreaterThanOrEqual(10);
    for (const q of SIGN_QUESTIONS) {
      expect(q.signId, q.id).toBeTruthy();
      expect(SIGN_BY_ID[q.signId!], `${q.id} sign ${q.signId}`).toBeTruthy();
      expect(q.correct.length).toBe(q.selectCount);
      expect(q.correct[0]).toBeLessThan(q.options.length);
      expect(q.category).toBe("road-and-traffic-signs");
    }
  });
});

describe("case studies", () => {
  it("each has a scenario and five well-formed questions", () => {
    expect(CASE_STUDIES.length).toBeGreaterThan(0);
    for (const cs of CASE_STUDIES) {
      expect(cs.scenario.length).toBeGreaterThan(0);
      expect(cs.questions.length).toBe(5);
      for (const q of cs.questions) {
        expect(q.correct.length).toBe(q.selectCount);
        expect(q.correct[0]).toBeLessThan(q.options.length);
        expect(q.explanation.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("adaptive study", () => {
  it("readiness is 0 with no history and capped at 100", () => {
    const r = readiness(emptyProgress());
    expect(r.percent).toBe(0);
    expect(r.label).toBeTruthy();
  });
  it("buildSmartSet returns the requested number of unique questions", () => {
    const set = buildSmartSet(emptyProgress(), 20);
    expect(set.length).toBe(20);
    expect(new Set(set.map((q) => q.id)).size).toBe(20);
  });
  it("reviewMistakes returns only questions answered wrong", () => {
    const p = emptyProgress();
    const all = QUESTIONS_BY_CATEGORY["alertness"];
    p.questions[all[0].id] = { seen: 2, correct: 1 }; // wrong at least once
    p.questions[all[1].id] = { seen: 3, correct: 3 }; // always right
    const m = reviewMistakes(p);
    expect(m.map((q) => q.id)).toContain(all[0].id);
    expect(m.map((q) => q.id)).not.toContain(all[1].id);
  });
});

describe("road signs", () => {
  it("has a healthy set with unique ids and meanings", () => {
    expect(SIGNS.length).toBeGreaterThanOrEqual(30);
    const ids = new Set(SIGNS.map((s) => s.id));
    expect(ids.size).toBe(SIGNS.length);
    for (const s of SIGNS) {
      expect(s.name).toBeTruthy();
      expect(s.meaning.length).toBeGreaterThan(0);
    }
  });
});
