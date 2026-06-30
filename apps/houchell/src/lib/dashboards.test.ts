import { describe, it, expect } from "vitest";
import {
  daysSince,
  snapshotIsFresh,
  MAX_SNAPSHOT_AGE_DAYS,
  schoolSnapshotObjectives,
  summariseSchoolSnapshot,
  groupInterventionByObjective,
} from "./dashboards";

describe("daysSince", () => {
  const now = Date.parse("2026-06-30T12:00:00Z");

  it("returns null for absent or unparseable dates", () => {
    expect(daysSince(null, now)).toBeNull();
    expect(daysSince(undefined, now)).toBeNull();
    expect(daysSince("", now)).toBeNull();
    expect(daysSince("not-a-date", now)).toBeNull();
  });

  it("counts whole days, flooring partial days", () => {
    expect(daysSince("2026-06-30", now)).toBe(0); // same day, 12h in
    expect(daysSince("2026-06-29", now)).toBe(1);
    expect(daysSince("2026-06-23", now)).toBe(7);
  });

  it("clamps a future snapshot date to 0 rather than going negative", () => {
    expect(daysSince("2026-07-05", now)).toBe(0);
  });
});

describe("snapshotIsFresh", () => {
  const now = Date.parse("2026-06-30T12:00:00Z");

  it("is false when there is no snapshot date", () => {
    expect(snapshotIsFresh(null, MAX_SNAPSHOT_AGE_DAYS, now)).toBe(false);
    expect(snapshotIsFresh(undefined, MAX_SNAPSHOT_AGE_DAYS, now)).toBe(false);
  });

  it("serves a recent snapshot", () => {
    expect(snapshotIsFresh("2026-06-29", MAX_SNAPSHOT_AGE_DAYS, now)).toBe(true);
    expect(snapshotIsFresh("2026-06-24", MAX_SNAPSHOT_AGE_DAYS, now)).toBe(true); // 6 days
  });

  it("falls through (false) once the snapshot is older than the max age", () => {
    expect(snapshotIsFresh("2026-06-16", MAX_SNAPSHOT_AGE_DAYS, now)).toBe(true); // exactly 14 days
    expect(snapshotIsFresh("2026-06-15", MAX_SNAPSHOT_AGE_DAYS, now)).toBe(false); // 15 days — stale
  });
});

describe("schoolSnapshotObjectives", () => {
  it("maps stored objectives to the live rollup shape (marked null)", () => {
    const out = schoolSnapshotObjectives({
      objectives: [{ topic_name: "Osmosis", avg: 42, classes: 3 }],
    });
    expect(out).toEqual([{ topic_name: "Osmosis", pct_correct: 42, marked: null, classes: 3 }]);
  });

  it("is empty for a missing/empty payload", () => {
    expect(schoolSnapshotObjectives(null)).toEqual([]);
    expect(schoolSnapshotObjectives(undefined)).toEqual([]);
    expect(schoolSnapshotObjectives({})).toEqual([]);
  });
});

describe("summariseSchoolSnapshot", () => {
  it("averages per-class averages and ignores classes with no data", () => {
    const { schoolAvg } = summariseSchoolSnapshot([
      { avg: 40, weak: [] },
      { avg: 60, weak: [] },
      { avg: null, weak: [] }, // unlinked / no marks — excluded from the mean
    ]);
    expect(schoolAvg).toBe(50);
  });

  it("returns null schoolAvg when no class has data", () => {
    expect(summariseSchoolSnapshot([{ avg: null, weak: [] }]).schoolAvg).toBeNull();
    expect(summariseSchoolSnapshot([]).schoolAvg).toBeNull();
  });

  it("tallies an objective across classes and sorts weakest-first", () => {
    const { objectives } = summariseSchoolSnapshot([
      { avg: 50, weak: [{ topic_id: "t1", topic_name: "Osmosis", pct: 30 }, { topic_id: "t2", topic_name: "Forces", pct: 70 }] },
      { avg: 50, weak: [{ topic_id: "t1", topic_name: "Osmosis", pct: 50 }] },
    ]);
    expect(objectives).toEqual([
      { topic_name: "Osmosis", avg: 40, classes: 2 }, // (30+50)/2, in 2 classes, weakest
      { topic_name: "Forces", avg: 70, classes: 1 },
    ]);
  });

  it("caps the objective list at 12 (the weakest 12)", () => {
    const weak = Array.from({ length: 20 }, (_, i) => ({
      topic_id: `t${i}`,
      topic_name: `Topic ${i}`,
      pct: i, // ascending, so the weakest 12 are 0..11
    }));
    const { objectives } = summariseSchoolSnapshot([{ avg: 10, weak }]);
    expect(objectives).toHaveLength(12);
    expect(objectives[0]).toMatchObject({ topic_name: "Topic 0", avg: 0 });
    expect(objectives.at(-1)).toMatchObject({ topic_name: "Topic 11", avg: 11 });
  });
});

describe("groupInterventionByObjective", () => {
  it("counts pupils per objective, averages their scores, most-affected first", () => {
    const rows = [
      { topic_name: "Osmosis", pct_correct: 30 },
      { topic_name: "Osmosis", pct_correct: 50 },
      { topic_name: "Osmosis", pct_correct: 40 },
      { topic_name: "Forces", pct_correct: 20 },
    ];
    expect(groupInterventionByObjective(rows)).toEqual([
      { topic_name: "Osmosis", pupils: 3, avg: 40 }, // 3 pupils → first
      { topic_name: "Forces", pupils: 1, avg: 20 },
    ]);
  });

  it("is empty for no rows", () => {
    expect(groupInterventionByObjective([])).toEqual([]);
  });
});
