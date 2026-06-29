import { describe, it, expect } from "vitest";
import { pupilProgressLine } from "./pupilProgress.js";

describe("pupilProgressLine", () => {
  it("invites practice when there's no data yet", () => {
    const line = pupilProgressLine(null, 0);
    expect(line).toMatch(/progress shows up here/i);
  });

  it("celebrates a high recent score", () => {
    expect(pupilProgressLine(92, 0)).toMatch(/92%/);
    expect(pupilProgressLine(92, 0)).toMatch(/flying/i);
  });

  it("encourages at a mid score and points at the topics when there are weak ones", () => {
    expect(pupilProgressLine(55, 3)).toMatch(/55%/);
    expect(pupilProgressLine(55, 3)).toMatch(/topics below/i);
  });

  it("does not mention topics below when there are none", () => {
    expect(pupilProgressLine(55, 0)).not.toMatch(/topics below/i);
  });

  it("stays supportive at a low score", () => {
    const line = pupilProgressLine(12, 4);
    expect(line).toMatch(/12%/);
    expect(line).toMatch(/small wins/i);
  });
});
