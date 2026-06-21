import { describe, it, expect } from "vitest";
import { masteryKey, rollupRetrieval, blendObjectiveMastery, type AssessmentObjective } from "./mastery.js";

describe("masteryKey", () => {
  it("normalises whitespace, case and punctuation so near-names join", () => {
    expect(masteryKey("Ionic Bonding")).toBe("ionic bonding");
    expect(masteryKey("ionic  bonding!")).toBe("ionic bonding");
    expect(masteryKey("Cells & Tissues")).toBe("cells tissues");
  });
});

describe("rollupRetrieval", () => {
  it("mark-weights across classes when marks are present", () => {
    const out = rollupRetrieval([
      [{ topic_name: "Cells", pct_correct: 40, marked: 10 }],
      [{ topic_name: "Cells", pct_correct: 80, marked: 30 }],
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].pct).toBe(70); // (40*10 + 80*30) / 40
    expect(out[0].marked).toBe(40);
    expect(out[0].classes).toBe(2);
  });
  it("falls back to a simple mean when no marks are given", () => {
    const out = rollupRetrieval([
      [{ topic_name: "Atoms", pct_correct: 50 }],
      [{ topic_name: "Atoms", pct_correct: 70 }],
    ]);
    expect(out[0].pct).toBe(60);
  });
});

describe("blendObjectiveMastery", () => {
  const assess: AssessmentObjective[] = [
    { objective_id: "o1", objective: "Cells", pct: 80, marked: 60, students: 30, subject_slug: "science", strand: "Biology" },
  ];

  it("merges a topic present in both sources, mark-weighting the blend", () => {
    const retrieval = rollupRetrieval([[{ topic_name: "Cells", pct_correct: 40, marked: 20 }]]);
    const out = blendObjectiveMastery(retrieval, assess);
    expect(out).toHaveLength(1);
    const c = out[0];
    expect(c.sources.sort()).toEqual(["assessment", "retrieval"]);
    expect(c.retrieval).toEqual({ pct: 40, marked: 20 });
    expect(c.assessment).toEqual({ pct: 80, marked: 60, students: 30 });
    expect(c.blendedPct).toBe(70); // (40*20 + 80*60)/80
    expect(c.marked).toBe(80);
    expect(c.objective_id).toBe("o1");
    expect(c.strand).toBe("Biology");
  });

  it("keeps single-source entries and sorts weakest-first", () => {
    const retrieval = rollupRetrieval([[{ topic_name: "Atoms", pct_correct: 30, marked: 10 }]]);
    const out = blendObjectiveMastery(retrieval, assess);
    expect(out.map((o) => o.label)).toEqual(["Atoms", "Cells"]); // 30 before 80
    const atoms = out[0];
    expect(atoms.sources).toEqual(["retrieval"]);
    expect(atoms.assessment).toBeUndefined();
    const cells = out[1];
    expect(cells.sources).toEqual(["assessment"]);
  });

  it("handles assessment-only input", () => {
    const out = blendObjectiveMastery([], assess);
    expect(out).toHaveLength(1);
    expect(out[0].blendedPct).toBe(80);
    expect(out[0].sources).toEqual(["assessment"]);
  });

  it("returns nothing for two empty sources", () => {
    expect(blendObjectiveMastery([], [])).toEqual([]);
  });
});
