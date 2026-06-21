import { describe, it, expect } from "vitest";
import { rollupTrust, mapPool, type EnrichedClass } from "./trustBenchmark.js";

const cls = (over: Partial<EnrichedClass> & { school_id: string; school_name: string }): EnrichedClass => ({
  year_group: 9, linked: true, weak: [], ...over,
});

describe("rollupTrust", () => {
  it("averages mastery per school and ranks weakest school first", () => {
    const r = rollupTrust([
      cls({ school_id: "s1", school_name: "Alpha", weak: [{ topic_id: "t1", topic_name: "Cells", pct_correct: 40 }, { topic_id: "t2", topic_name: "Atoms", pct_correct: 60 }] }),
      cls({ school_id: "s2", school_name: "Beta", weak: [{ topic_id: "t1", topic_name: "Cells", pct_correct: 80 }] }),
    ]);
    expect(r.schools.map((s) => s.name)).toEqual(["Alpha", "Beta"]); // Alpha (50) before Beta (80)
    expect(r.schools[0].avgMastery).toBe(50);
    expect(r.schools[1].avgMastery).toBe(80);
    expect(r.trustAvg).toBe(65); // mean of 50 and 80
  });

  it("aggregates a trust-wide cohort leaderboard with school counts", () => {
    const r = rollupTrust([
      cls({ school_id: "s1", school_name: "Alpha", weak: [{ topic_id: "t1", topic_name: "Cells", pct_correct: 40 }] }),
      cls({ school_id: "s2", school_name: "Beta", weak: [{ topic_id: "t1", topic_name: "Cells", pct_correct: 60 }] }),
    ]);
    const cells = r.cohort.find((c) => c.topic_name === "Cells");
    expect(cells?.avg).toBe(50);
    expect(cells?.schools).toBe(2);
  });

  it("counts linked classes and tolerates classes with no weak topics", () => {
    const r = rollupTrust([
      cls({ school_id: "s1", school_name: "Alpha", linked: true, weak: [] }),
      cls({ school_id: "s1", school_name: "Alpha", linked: false, weak: [] }),
    ]);
    expect(r.schools[0].classes).toBe(2);
    expect(r.schools[0].linked).toBe(1);
    expect(r.schools[0].avgMastery).toBeNull();
    expect(r.trustAvg).toBeNull();
  });
});

describe("mapPool", () => {
  it("preserves input order despite concurrency", async () => {
    const out = await mapPool([1, 2, 3, 4, 5], 2, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });
  it("never runs more than the pool size at once", async () => {
    let active = 0, peak = 0;
    await mapPool([1, 2, 3, 4, 5, 6], 2, async () => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    });
    expect(peak).toBeLessThanOrEqual(2);
  });
  it("handles an empty list", async () => {
    expect(await mapPool([], 4, async (x) => x)).toEqual([]);
  });
});
