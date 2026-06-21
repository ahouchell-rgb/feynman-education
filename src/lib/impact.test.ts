import { describe, it, expect } from "vitest";
import {
  overallTrend, objectiveDeltas, baselineSnapshot, mostImproved, stillStuck,
  impactNarrative, type Snapshot,
} from "./impact.js";

// A small term-long series: three weekly snapshots, school avg climbing 50→58,
// with per-objective payloads that move at different rates.
const series: Snapshot[] = [
  { taken_on: "2026-01-01", school_avg: 50, payload: { objectives: [
    { topic_name: "Ionic bonding", avg: 40, classes: 3 },
    { topic_name: "Forces", avg: 60, classes: 2 },
    { topic_name: "Cells", avg: 55, classes: 4 },
  ] } },
  { taken_on: "2026-01-15", school_avg: 54, payload: { objectives: [
    { topic_name: "Ionic bonding", avg: 48, classes: 3 },
    { topic_name: "Forces", avg: 58, classes: 2 },
  ] } },
  { taken_on: "2026-01-29", school_avg: 58, payload: { objectives: [
    { topic_name: "Ionic bonding", avg: 62, classes: 3 },     // +22
    { topic_name: "Forces", avg: 57, classes: 2 },            // −3
    { topic_name: "Photosynthesis", avg: 35, classes: 1 },    // newly tracked
  ] } },
];

describe("overallTrend", () => {
  it("computes first/latest/delta and weeks across the series", () => {
    const t = overallTrend(series);
    expect(t.enough).toBe(true);
    expect(t.first).toBe(50);
    expect(t.latest).toBe(58);
    expect(t.delta).toBe(8);
    expect(t.weeks).toBe(4); // 28 days
    expect(t.points.map((p) => p.avg)).toEqual([50, 54, 58]);
  });

  it("degrades gracefully with a single reading (no delta)", () => {
    const t = overallTrend([series[0]]);
    expect(t.enough).toBe(false);
    expect(t.delta).toBeNull();
    expect(t.latest).toBe(50);
  });

  it("drops null school_avg readings", () => {
    const t = overallTrend([{ taken_on: "2026-01-01", school_avg: null }, ...series]);
    expect(t.points).toHaveLength(3);
    expect(t.first).toBe(50);
  });
});

describe("baselineSnapshot", () => {
  it("returns the earliest when no window given", () => {
    expect(baselineSnapshot(series)?.taken_on).toBe("2026-01-01");
  });
  it("picks the snapshot at-or-before N weeks ago", () => {
    // latest is 2026-01-29; 2 weeks ago = 2026-01-15 → that snapshot.
    expect(baselineSnapshot(series, 2)?.taken_on).toBe("2026-01-15");
  });
  it("falls back to earliest when the window predates all history", () => {
    expect(baselineSnapshot(series, 52)?.taken_on).toBe("2026-01-01");
  });
});

describe("objectiveDeltas", () => {
  it("compares latest vs earliest per objective, name-keyed", () => {
    const d = objectiveDeltas(series);
    const byKey = Object.fromEntries(d.map((x) => [x.key, x]));
    expect(byKey["ionic bonding"].delta).toBe(22); // 62 − 40
    expect(byKey["forces"].delta).toBe(-3);        // 57 − 60
  });
  it("keeps a newly-tracked objective with a null delta", () => {
    const d = objectiveDeltas(series);
    const photo = d.find((x) => x.key === "photosynthesis")!;
    expect(photo.latest).toBe(35);
    expect(photo.delta).toBeNull();
  });
  it("returns no deltas when only one snapshot exists", () => {
    const d = objectiveDeltas([series[2]]);
    expect(d.every((x) => x.delta === null)).toBe(true);
  });
});

describe("mostImproved / stillStuck", () => {
  it("ranks positive deltas strongest-first", () => {
    const top = mostImproved(objectiveDeltas(series));
    expect(top[0].label).toBe("Ionic bonding");
    expect(top.every((d) => d.delta! > 0)).toBe(true);
  });
  it("lists weakest current mastery below the ceiling", () => {
    const stuck = stillStuck(objectiveDeltas(series));
    expect(stuck[0].label).toBe("Photosynthesis"); // 35% is the lowest
    expect(stuck.every((d) => d.latest < 65)).toBe(true);
  });
});

describe("impactNarrative", () => {
  it("templates a governors line from the numbers", () => {
    const n = impactNarrative(overallTrend(series), objectiveDeltas(series), [
      { label: "Y11 mock pass rate", metric: "pass rate %", value: 68, term: "Spring" },
    ]);
    expect(n).toContain("Cohort mastery rose from 50% to 58% (+8 pts)");
    expect(n).toContain("Most improved area: Ionic bonding (+22 pts)");
    expect(n).toContain("weakest area remains Photosynthesis at 35%");
    expect(n).toContain("Y11 mock pass rate");
    expect(n).toContain("68");
  });

  it("degrades gracefully with thin history", () => {
    const n = impactNarrative(overallTrend([series[0]]), objectiveDeltas([series[0]]));
    expect(n).toContain("not enough snapshot history yet");
  });

  it("reports a decline when mastery falls", () => {
    const falling: Snapshot[] = [
      { taken_on: "2026-01-01", school_avg: 60, payload: { objectives: [] } },
      { taken_on: "2026-01-15", school_avg: 52, payload: { objectives: [] } },
    ];
    const n = impactNarrative(overallTrend(falling), objectiveDeltas(falling));
    expect(n).toContain("fell from 60% to 52% (-8 pts)");
  });
});
