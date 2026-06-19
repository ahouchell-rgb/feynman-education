import { describe, it, expect } from "vitest";
import { extractHtml } from "./htmlExtract.js";

describe("extractHtml — recovering the sheet from a drifting LLM reply", () => {
  it("pulls the contents of a ```html fence and trims it", () => {
    const reply = "Here is your sheet:\n\n```html\n<html><body>Hi</body></html>\n```\nHope that helps!";
    expect(extractHtml(reply)).toBe("<html><body>Hi</body></html>");
  });
  it("is case-insensitive about the fence label", () => {
    expect(extractHtml("```HTML\n<html>x</html>\n```")).toBe("<html>x</html>");
  });
  it("falls back to a raw <html>…</html> document when the fence is missing", () => {
    const reply = "Sure! <html><body>Sheet</body></html> Let me know.";
    expect(extractHtml(reply)).toBe("<html><body>Sheet</body></html>");
  });
  it("recognises a <!doctype html> document too", () => {
    const reply = "prose\n<!doctype html><html><body>D</body></html>\nmore";
    expect(extractHtml(reply)).toBe("<!doctype html><html><body>D</body></html>");
  });
  it("prefers the fenced block over a stray inline <html>", () => {
    const reply = "<html>WRONG</html>\n```html\n<html>RIGHT</html>\n```";
    expect(extractHtml(reply)).toBe("<html>RIGHT</html>");
  });
  it("falls back to the whole trimmed reply when there is no recognisable HTML", () => {
    expect(extractHtml("  just some prose  ")).toBe("just some prose");
  });
  it("captures multi-line documents inside the fence", () => {
    const doc = "<html>\n  <body>\n    <h1>Topic</h1>\n  </body>\n</html>";
    expect(extractHtml("```html\n" + doc + "\n```")).toBe(doc);
  });
});
