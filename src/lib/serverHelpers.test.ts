import { describe, it, expect } from "vitest";
import { extractHtml, anthropicText, bearerToken, pickModel, AI_MODELS } from "./serverHelpers.js";

describe("extractHtml", () => {
  it("pulls HTML out of a ```html fenced block", () => {
    const out = extractHtml("Here you go:\n```html\n<h1>Hi</h1>\n```\nDone.");
    expect(out).toBe("<h1>Hi</h1>");
  });
  it("falls back to a raw <html>…</html> document", () => {
    const out = extractHtml("preamble <html><body>x</body></html> trailing");
    expect(out).toBe("<html><body>x</body></html>");
  });
  it("matches a <!doctype> document", () => {
    const out = extractHtml("<!doctype html><html><body>y</body></html>");
    expect(out).toBe("<!doctype html><html><body>y</body></html>");
  });
  it("returns trimmed text when there is no HTML wrapper", () => {
    expect(extractHtml("  just words  ")).toBe("just words");
  });
  it("is tolerant of empty input", () => {
    expect(extractHtml("")).toBe("");
  });
});

describe("anthropicText", () => {
  it("concatenates only the text blocks", () => {
    const data = { content: [{ type: "text", text: "a" }, { type: "tool_use", input: {} }, { type: "text", text: "b" }] };
    expect(anthropicText(data)).toBe("ab");
  });
  it("returns empty string for a malformed response", () => {
    expect(anthropicText({})).toBe("");
    expect(anthropicText(null)).toBe("");
  });
});

describe("bearerToken", () => {
  it("extracts a Bearer token", () => {
    const req = new Request("https://x.test", { headers: { authorization: "Bearer abc.def" } });
    expect(bearerToken(req)).toBe("abc.def");
  });
  it("returns null when missing or wrong scheme", () => {
    expect(bearerToken(new Request("https://x.test"))).toBeNull();
    expect(bearerToken(new Request("https://x.test", { headers: { authorization: "Basic xyz" } }))).toBeNull();
  });
});

describe("pickModel", () => {
  it("routes bulk/derived work to the cheap model and authoring to Opus", () => {
    expect(pickModel("bulk")).toBe(AI_MODELS.SONNET);
    expect(pickModel("authoring")).toBe(AI_MODELS.OPUS);
  });
});
