import { describe, it, expect } from "vitest";
import { paginate } from "./supabase.js";

// Build a fake paged source of `total` rows. `serverCap` simulates PostgREST's
// max-rows (a single request never returns more than serverCap, even if a larger
// batch is asked for).
function makeSource(total, serverCap = Infinity) {
  const rows = Array.from({ length: total }, (_, i) => ({ i }));
  const calls = [];
  const fetchPage = async (offset, batch) => {
    calls.push([offset, batch]);
    return rows.slice(offset, offset + Math.min(batch, serverCap));
  };
  return { fetchPage, calls };
}

describe("paginate", () => {
  it("returns [] for an empty source (one probing call)", async () => {
    const s = makeSource(0);
    const out = await paginate(s.fetchPage);
    expect(out).toEqual([]);
    expect(s.calls).toEqual([[0, 1000]]);
  });

  it("fetches a single partial page, then stops on the empty page", async () => {
    const s = makeSource(3);
    const out = await paginate(s.fetchPage);
    expect(out).toHaveLength(3);
    expect(s.calls).toEqual([[0, 1000], [3, 1000]]);
  });

  it("walks multiple pages, advancing offset, preserving order", async () => {
    const s = makeSource(2500, 1000);
    const out = await paginate(s.fetchPage, { batch: 1000 });
    expect(out).toHaveLength(2500);
    expect(out[0].i).toBe(0);
    expect(out[2499].i).toBe(2499);
    expect(s.calls.map(c => c[0])).toEqual([0, 1000, 2000, 2500]); // last call returns []
  });

  it("stays correct when the server cap is smaller than the batch", async () => {
    // batch=1000 but server only ever returns 400 — a 'stop on short page' impl
    // would wrongly stop after the first page. paginate must keep going.
    const s = makeSource(950, 400);
    const out = await paginate(s.fetchPage, { batch: 1000 });
    expect(out).toHaveLength(950);
  });

  it("honours the max guard (runaway protection)", async () => {
    const s = makeSource(10000, 1000);
    const out = await paginate(s.fetchPage, { batch: 1000, max: 50 });
    expect(out).toHaveLength(1000); // stops after the batch that crosses max
    expect(s.calls).toHaveLength(1);
  });
});
