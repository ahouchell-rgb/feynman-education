import { describe, it, expect } from "vitest";
import { resolve, hexToRgb, rgbToHex, clampByte, applyMods } from "./importPptx.js";

describe("resolve — turning a relationship target into a part path", () => {
  const slide = "ppt/slides/slide1.xml";
  it("resolves a relative ../ target against the part's folder", () => {
    expect(resolve(slide, "../media/image1.png")).toBe("ppt/media/image1.png");
    expect(resolve(slide, "../slideLayouts/slideLayout1.xml")).toBe("ppt/slideLayouts/slideLayout1.xml");
  });
  it("treats a leading slash as package-absolute", () => {
    expect(resolve(slide, "/ppt/theme/theme1.xml")).toBe("ppt/theme/theme1.xml");
  });
  it("resolves a sibling target (no ../)", () => {
    expect(resolve(slide, "slide2.xml")).toBe("ppt/slides/slide2.xml");
  });
  it("walks multiple ../ segments and ignores ./ and empty segments", () => {
    expect(resolve("a/b/c.xml", "../../x.xml")).toBe("x.xml");
    expect(resolve(slide, "./../media/i.png")).toBe("ppt/media/i.png");
  });
  it("returns null for a missing target", () => {
    expect(resolve(slide, null)).toBeNull();
    expect(resolve(slide, "")).toBeNull();
  });
});

describe("hexToRgb / rgbToHex — colour round-tripping", () => {
  it("parses a #rrggbb string", () => {
    expect(hexToRgb("#ff8800")).toEqual({ r: 255, g: 136, b: 0 });
  });
  it("tolerates a missing # and is case-insensitive", () => {
    expect(hexToRgb("FF8800")).toEqual({ r: 255, g: 136, b: 0 });
  });
  it("returns null for malformed input", () => {
    expect(hexToRgb("nope")).toBeNull();
    expect(hexToRgb("#fff")).toBeNull(); // 3-digit shorthand is not supported by the parser
    expect(hexToRgb("")).toBeNull();
  });
  it("round-trips rgb → hex → rgb", () => {
    expect(rgbToHex({ r: 46, g: 58, b: 95 })).toBe("#2e3a5f");
    expect(hexToRgb(rgbToHex({ r: 1, g: 2, b: 3 }))).toEqual({ r: 1, g: 2, b: 3 });
  });
  it("clamps + rounds out-of-range channels (clampByte)", () => {
    expect(clampByte(-5)).toBe(0);
    expect(clampByte(300)).toBe(255);
    expect(clampByte(127.6)).toBe(128);
    expect(rgbToHex({ r: 300, g: -10, b: 127.6 })).toBe("#ff0080");
  });
});

describe("applyMods — OOXML tint/shade/lum modifiers", () => {
  // applyMods reads the modifier tags as CHILDREN of the passed colour element.
  const clrEl = (inner: string) =>
    new DOMParser().parseFromString(`<c>${inner}</c>`, "application/xml").documentElement;

  it("returns the base colour unchanged when there are no modifiers", () => {
    expect(applyMods("#808080", clrEl(""))).toBe("#808080");
  });
  it("shade darkens towards black by the val fraction", () => {
    // shade 50% of #808080 (128) → 64 = #40
    expect(applyMods("#808080", clrEl('<shade val="50000"/>'))).toBe("#404040");
  });
  it("tint lightens towards white by the val fraction", () => {
    // tint 0% of any colour collapses to white
    expect(applyMods("#808080", clrEl('<tint val="0"/>'))).toBe("#ffffff");
  });
  it("leaves a bad base hex untouched", () => {
    expect(applyMods("not-a-hex", clrEl('<shade val="50000"/>'))).toBe("not-a-hex");
  });
});
