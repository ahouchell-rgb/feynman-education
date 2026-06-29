import { describe, it, expect } from "vitest";
import { costGBP } from "./aiBudget.js";
import { AI_MODELS } from "./serverHelpers.js";

describe("costGBP", () => {
  it("prices Opus higher than Sonnet for the same tokens", () => {
    const opus = costGBP(1_000_000, 1_000_000, AI_MODELS.OPUS);
    const sonnet = costGBP(1_000_000, 1_000_000, AI_MODELS.SONNET);
    expect(opus).toBeGreaterThan(sonnet);
  });
  it("computes a known Sonnet figure (3/15 USD per Mtok × 0.79)", () => {
    // 1M in + 1M out = (3 + 15) USD × 0.79 = £14.22
    expect(costGBP(1_000_000, 1_000_000, AI_MODELS.SONNET)).toBeCloseTo(14.22, 2);
  });
  it("computes a known Opus figure (5/25 USD per Mtok × 0.79)", () => {
    // (5 + 25) USD × 0.79 = £23.70
    expect(costGBP(1_000_000, 1_000_000, AI_MODELS.OPUS)).toBeCloseTo(23.7, 2);
  });
  it("defaults unknown models to the conservative Opus rate", () => {
    expect(costGBP(1_000_000, 0, "made-up-model")).toBeCloseTo(costGBP(1_000_000, 0, AI_MODELS.OPUS), 6);
  });
  it("is zero for no usage", () => {
    expect(costGBP(0, 0, AI_MODELS.SONNET)).toBe(0);
  });
});
