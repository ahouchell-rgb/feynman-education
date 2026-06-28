import { describe, it, expect } from "vitest";
import { matchClassName, normalise } from "./timetableMatch.js";

const classes = [
  { id: "a", name: "10X Chemistry", discipline: "chemistry" },
  { id: "b", name: "8Y", discipline: "biology" },
  { id: "c", name: "11Z Triple", discipline: "physics" },
];

describe("normalise", () => {
  it("lowercases, strips punctuation and collapses whitespace", () => {
    expect(normalise("10X  Chem.")).toBe("10x chem");
    expect(normalise("  11Z—Triple ")).toBe("11z triple");
    expect(normalise("!!!")).toBe("");
  });
});

describe("matchClassName", () => {
  it("matches an exact name", () => {
    expect(matchClassName("10X Chemistry", classes)).toBe("a");
    expect(matchClassName("8Y", classes)).toBe("b");
  });

  it("matches case-insensitively and ignoring punctuation/whitespace", () => {
    expect(matchClassName("10x chemistry", classes)).toBe("a");
    expect(matchClassName("10X  Chemistry", classes)).toBe("a");
    expect(matchClassName(" 11z triple ", classes)).toBe("c");
  });

  it("returns null for an unknown class", () => {
    expect(matchClassName("9A French", classes)).toBeNull();
    expect(matchClassName("", classes)).toBeNull();
  });

  it("returns null when no classes are provided", () => {
    expect(matchClassName("10X Chemistry", [])).toBeNull();
  });

  it("returns null on an ambiguous normalised match", () => {
    const dupes = [
      { id: "x", name: "10X Chem" },
      { id: "y", name: "10x chem" },
    ];
    expect(matchClassName("10X CHEM", dupes)).toBeNull();
  });

  it("prefers an exact match even when a normalised duplicate exists", () => {
    const mixed = [
      { id: "x", name: "10X Chem" },
      { id: "y", name: "10x  chem" },
    ];
    expect(matchClassName("10X Chem", mixed)).toBe("x");
  });
});
