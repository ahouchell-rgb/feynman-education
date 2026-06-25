import { describe, it, expect } from "vitest";
import { buildSystem } from "./prompt";

// T6.3 — the slides-assistant system prompt is built around the deck's subject,
// so a Maths deck is authored as maths rather than science with maths bolted on.
describe("buildSystem", () => {
  it("defaults to a science teacher when no subject is given", () => {
    for (const s of [undefined, null, ""]) {
      const sys = buildSystem(s);
      expect(sys).toContain("UK secondary science teacher");
      expect(sys).toContain("scientifically accurate");
      // Science keeps its per-discipline palette.
      expect(sys).toContain("biology green #5e7c4b");
    }
  });

  it("builds a maths-specific prompt for a Maths deck", () => {
    const sys = buildSystem("Mathematics");
    expect(sys).toContain("UK secondary Mathematics teacher");
    expect(sys).toContain("accurate for Mathematics");
    // No science-only palette or accuracy wording leaks into a non-science deck.
    expect(sys).not.toContain("biology green #5e7c4b");
    expect(sys).not.toContain("scientifically accurate");
  });

  it("treats the science strands as science (keeps the discipline palette)", () => {
    for (const s of ["Biology", "Chemistry", "Physics", "Science"]) {
      const sys = buildSystem(s);
      expect(sys).toContain(`UK secondary ${s} teacher`);
      expect(sys).toContain("biology green #5e7c4b");
      expect(sys).toContain("scientifically accurate");
    }
  });

  it("always keeps the structural scaffold regardless of subject", () => {
    const sys = buildSystem("English");
    expect(sys).toContain("apply_edits");
    expect(sys).toContain("FIXED 960×540 canvas");
    expect(sys).toContain("HOUSE LESSON TEMPLATE");
  });
});
