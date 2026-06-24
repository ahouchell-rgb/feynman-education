import { describe, it, expect } from "vitest";
import { sanitizeUrl, snapToGrid, GRID } from "./constants";

describe("sanitizeUrl — only http/https/mailto links survive", () => {
  it("passes http/https/mailto through unchanged", () => {
    expect(sanitizeUrl("https://example.com")).toBe("https://example.com");
    expect(sanitizeUrl("http://x.org/a?b=1")).toBe("http://x.org/a?b=1");
    expect(sanitizeUrl("mailto:a@b.com")).toBe("mailto:a@b.com");
  });
  it("upgrades a bare domain to https", () => {
    expect(sanitizeUrl("example.com")).toBe("https://example.com");
    expect(sanitizeUrl("sub.example.co.uk/p")).toBe("https://sub.example.co.uk/p");
  });
  it("drops script / data / relative / empty urls", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBe("");
    expect(sanitizeUrl("data:text/html,x")).toBe("");
    expect(sanitizeUrl("/relative/path")).toBe("");
    expect(sanitizeUrl("")).toBe("");
    expect(sanitizeUrl(null)).toBe("");
    expect(sanitizeUrl(undefined)).toBe("");
  });
});

describe("snapToGrid — rounds a coordinate to the grid step", () => {
  it("snaps to the nearest multiple of GRID", () => {
    expect(snapToGrid(0)).toBe(0);
    expect(snapToGrid(4)).toBe(0);
    expect(snapToGrid(6)).toBe(GRID);
    expect(snapToGrid(GRID * 3 + 1)).toBe(GRID * 3);
    expect(snapToGrid(-6)).toBe(-GRID);
  });
});
