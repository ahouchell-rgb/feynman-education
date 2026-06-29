import { describe, it, expect } from "vitest";
import { toSubscript, toSuperscript, looksLikeFormula, autoSub, mapScript } from "./formula.js";

describe("toSubscript (whole-text, digit after a letter/bracket)", () => {
  it("subscripts chemical formulae", () => {
    expect(toSubscript("H2O")).toBe("H₂O");
    expect(toSubscript("CO2")).toBe("CO₂");
    expect(toSubscript("H2SO4")).toBe("H₂SO₄");
    expect(toSubscript("Ca(OH)2")).toBe("Ca(OH)₂");
  });
  it("leaves leading numbers (coefficients) alone", () => {
    expect(toSubscript("2H2O")).toBe("2H₂O"); // the leading 2 is not after a letter
  });
});

describe("toSuperscript (after ^)", () => {
  it("superscripts powers and signs", () => {
    expect(toSuperscript("10^23")).toBe("10²³");
    expect(toSuperscript("x^2")).toBe("x²");
    expect(toSuperscript("3^-2")).toBe("3⁻²");
  });
});

describe("looksLikeFormula (the safety guard)", () => {
  it("accepts real formulae", () => {
    for (const f of ["CO2", "H2O", "H2SO4", "CaCO3", "Ca(OH)2", "C6H12O6", "NaCl2"])
      expect(looksLikeFormula(f)).toBe(true);
  });
  it("rejects lesson codes and plain tokens", () => {
    for (const t of ["P1", "C2", "B9", "P2", "7", "10", "Year", "Lesson"])
      expect(looksLikeFormula(t)).toBe(false);
  });
});

describe("autoSub (live auto-format) — the critical trust behaviour", () => {
  it("converts formulae in running text", () => {
    expect(autoSub("CO2")).toBe("CO₂");
    expect(autoSub("make H2O and H2SO4")).toBe("make H₂O and H₂SO₄");
    expect(autoSub("Ca(OH)2")).toBe("Ca(OH)₂");
  });
  it("NEVER mangles the teacher's lesson codes", () => {
    expect(autoSub("P1.1 Speed")).toBe("P1.1 Speed");
    expect(autoSub("C2.3 elements")).toBe("C2.3 elements");
    expect(autoSub("B9 Inheritance")).toBe("B9 Inheritance");
    expect(autoSub("P2.1")).toBe("P2.1");
  });
  it("leaves ordinary prose and numbers untouched", () => {
    expect(autoSub("Year 7")).toBe("Year 7");
    expect(autoSub("Lesson 1 — 10 marks, set 2")).toBe("Lesson 1 — 10 marks, set 2");
  });
  it("leaves bare single-group diatomics to the manual toggle", () => {
    expect(autoSub("O2")).toBe("O2");
    expect(autoSub("H2")).toBe("H2");
  });
  it("is idempotent (already-subscripted text is stable)", () => {
    expect(autoSub(autoSub("H2SO4"))).toBe("H₂SO₄");
  });
});

describe("mapScript (selection toggle)", () => {
  it("scripts a plain selection", () => {
    expect(mapScript("2", "sub")).toBe("₂");
    expect(mapScript("2", "sup")).toBe("²");
  });
  it("inverts an already-scripted selection back to normal", () => {
    expect(mapScript("₂", "sub")).toBe("2");
    expect(mapScript("²", "sup")).toBe("2");
  });
});
