import { describe, it, expect } from "vitest";
import { richToRuns, toFill, toHex, revealFrames, xIn, yIn, wIn, rot, linkOpt } from "./exportPptx.js";

describe("richToRuns — rich text → PptxGenJS runs (formatting must survive export)", () => {
  it("plain text becomes one run, line-broken", () => {
    const runs = richToRuns("hello");
    expect(runs).toHaveLength(1);
    expect(runs[0].text).toBe("hello");
    expect(runs[0].options.breakLine).toBe(true);
    expect(runs[0].options.bold).toBeUndefined();
  });
  it("preserves bold / italic / underline", () => {
    expect(richToRuns("<b>x</b>")[0].options.bold).toBe(true);
    expect(richToRuns("<i>x</i>")[0].options.italic).toBe(true);
    expect(richToRuns("<u>x</u>")[0].options.underline).toBe(true);
  });
  it("preserves colour as a 6-digit hex", () => {
    const runs = richToRuns('<span style="color:#b95a3c">red</span>');
    expect(runs[0].options.color).toBe("B95A3C");
  });
  it("splits <br> into separate lines", () => {
    const runs = richToRuns("a<br>b");
    expect(runs.map((r) => r.text)).toEqual(["a", "b"]);
  });
  it("marks bulleted and numbered list items", () => {
    expect(richToRuns("<ul><li>one</li></ul>")[0].options.bullet).toBe(true);
    expect(richToRuns("<ol><li>one</li></ol>")[0].options.bullet).toEqual({ type: "number" });
  });
  it("returns null for empty / whitespace-only HTML (so caller falls back to plain text)", () => {
    expect(richToRuns("")).toBeNull();
    expect(richToRuns("   ")).toBeNull();
  });
});

describe("toFill / toHex — colour conversion", () => {
  it("hex passes through uppercased", () => {
    expect(toHex("#b95a3c")).toBe("B95A3C");
  });
  it("null fill defaults to white", () => {
    expect(toFill(null)).toEqual({ color: "FFFFFF" });
  });
  it("rgba() converts and carries transparency", () => {
    expect(toFill("rgba(46,58,95,0.5)")).toEqual({ color: "2E3A5F", transparency: 50 });
  });
});

describe("revealFrames — click-to-reveal must survive as separate slides", () => {
  it("no reveals → a single frame", () => {
    expect(revealFrames([{ id: 1 }, { id: 2 }])).toHaveLength(1);
    expect(revealFrames([])).toHaveLength(1);
  });
  it("N reveals → N+1 cumulative frames", () => {
    const frames = revealFrames([{ id: 1 }, { id: 2, reveal: true }, { id: 3, reveal: true }]);
    expect(frames.map((f) => f.length)).toEqual([1, 2, 3]);
    expect(frames[2].map((e) => e.id)).toEqual([1, 2, 3]);
  });
});

describe("geometry & rotation", () => {
  it("maps the 960×540 canvas onto a 10in × 5.625in slide", () => {
    expect(xIn(960)).toBe(10);
    expect(xIn(480)).toBe(5);
    expect(yIn(540)).toBe(5.625);
    expect(wIn(96)).toBe(1);
  });
  it("normalises rotation to 0–359 (and treats 0 as none)", () => {
    expect(rot({})).toBeUndefined();
    expect(rot({ rotation: 0 })).toBeUndefined();
    expect(rot({ rotation: 90 })).toBe(90);
    expect(rot({ rotation: -90 })).toBe(270);
    expect(rot({ rotation: 450 })).toBe(90);
  });
});

describe("linkOpt — element hyperlink export (sanitised, never crashes)", () => {
  it("passes http/https/mailto through", () => {
    expect(linkOpt({ href: "https://example.com" })).toEqual({ url: "https://example.com" });
    expect(linkOpt({ href: "http://x.org/a" })).toEqual({ url: "http://x.org/a" });
    expect(linkOpt({ href: "mailto:a@b.com" })).toEqual({ url: "mailto:a@b.com" });
  });
  it("upgrades a bare domain to https", () => {
    expect(linkOpt({ href: "example.com/page" })).toEqual({ url: "https://example.com/page" });
  });
  it("drops unsafe or missing links (returns undefined)", () => {
    expect(linkOpt({ href: "javascript:alert(1)" })).toBeUndefined();
    expect(linkOpt({ href: "" })).toBeUndefined();
    expect(linkOpt({})).toBeUndefined();
    expect(linkOpt(null)).toBeUndefined();
  });
});
