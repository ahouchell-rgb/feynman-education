import { describe, it, expect } from "vitest";
import { masteryKey, rollupRetrieval, blendObjectiveMastery, crosswalkMap, type AssessmentObjective } from "./mastery.js";

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

  it("joins on objective id even when the names differ", () => {
    // Retrieval topic "Particle model" is mapped (crosswalk) to objective o1,
    // whose assessment name is "States of matter" — names differ, ids match.
    const retrieval = rollupRetrieval([[{ topic_name: "Particle model", pct_correct: 50, marked: 20, objective_id: "o1" }]]);
    const out = blendObjectiveMastery(retrieval, [
      { objective_id: "o1", objective: "States of matter", pct: 90, marked: 20, students: 20 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].sources.sort()).toEqual(["assessment", "retrieval"]);
    expect(out[0].blendedPct).toBe(70); // (50*20 + 90*20)/40
    expect(out[0].objective_id).toBe("o1");
    expect(out[0].nameMatchedOnly).toBeFalsy(); // joined by id, high confidence
  });

  it("flags a name-only join when both sources lack a shared objective_id", () => {
    // Retrieval topic has no objective_id (not in the crosswalk); the assessment
    // row also carries no objective_id — so they can only meet on the name key.
    const retrieval = rollupRetrieval([[{ topic_name: "Cells", pct_correct: 40, marked: 20 }]]);
    const out = blendObjectiveMastery(retrieval, [
      { objective: "Cells", pct: 80, marked: 60, students: 30 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].sources.sort()).toEqual(["assessment", "retrieval"]);
    expect(out[0].nameMatchedOnly).toBe(true); // fallback join, lower confidence
  });

  it("does not flag single-source entries as name-matched", () => {
    const retrieval = rollupRetrieval([[{ topic_name: "Atoms", pct_correct: 30, marked: 10 }]]);
    const out = blendObjectiveMastery(retrieval, assess);
    const atoms = out.find((o) => o.label === "Atoms")!;
    expect(atoms.sources).toEqual(["retrieval"]);
    expect(atoms.nameMatchedOnly).toBeFalsy();
    const cells = out.find((o) => o.label === "Cells")!;
    expect(cells.sources).toEqual(["assessment"]);
    expect(cells.nameMatchedOnly).toBeFalsy();
  });

  it("collapses differently-named topics that map to the same objective", () => {
    const retrieval = rollupRetrieval([
      [{ topic_name: "Particle model", pct_correct: 40, marked: 10, objective_id: "o1" }],
      [{ topic_name: "Changes of state", pct_correct: 60, marked: 10, objective_id: "o1" }],
    ]);
    expect(retrieval).toHaveLength(1);
    expect(retrieval[0].pct).toBe(50);
    expect(retrieval[0].objective_id).toBe("o1");
  });
});

describe("crosswalkMap", () => {
  it("indexes topic_id → objective_id and skips blanks", () => {
    const m = crosswalkMap([
      { topic_id: "t1", objective_id: "o1" },
      { topic_id: "", objective_id: "o2" } as any,
    ]);
    expect(m.get("t1")).toBe("o1");
    expect(m.size).toBe(1);
  });
});
