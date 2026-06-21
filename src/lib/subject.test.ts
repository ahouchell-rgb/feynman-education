import { describe, it, expect } from "vitest";
import { subjectName, subjectSlug, isScience } from "./subject.js";

describe("subjectName", () => {
  it("prefers the embedded subject name", () => {
    expect(subjectName({ subject: { name: "Mathematics", slug: "maths" } })).toBe("Mathematics");
  });
  it("falls back to the legacy science discipline", () => {
    expect(subjectName({ discipline: "biology" })).toBe("Biology");
    expect(subjectName({ discipline: "physics" })).toBe("Physics");
  });
  it("defaults to Science", () => {
    expect(subjectName({})).toBe("Science");
    expect(subjectName(null)).toBe("Science");
  });
});

describe("subjectSlug", () => {
  it("uses the embedded subject slug", () => {
    expect(subjectSlug({ subject: { name: "Maths", slug: "maths" } })).toBe("maths");
  });
  it("treats discipline-only units as science", () => {
    expect(subjectSlug({ discipline: "chemistry" })).toBe("science");
  });
  it("defaults to science", () => {
    expect(subjectSlug({})).toBe("science");
  });
});

describe("isScience", () => {
  it("is true for science and discipline units, false for other subjects", () => {
    expect(isScience({ discipline: "biology" })).toBe(true);
    expect(isScience({ subject: { slug: "science" } })).toBe(true);
    expect(isScience({ subject: { slug: "maths" } })).toBe(false);
  });
});
