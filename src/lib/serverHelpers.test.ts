import { describe, it, expect } from "vitest";
import { extractHtml, anthropicText, bearerToken, pickModel, AI_MODELS, withTimeout } from "./serverHelpers.js";

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

describe("withTimeout", () => {
  it("resolves with the fn's value when it finishes in time", async () => {
    const out = await withTimeout(async () => "ok", 50);
    expect(out).toBe("ok");
  });

  it("rejects with a timeout error when the fn is too slow", async () => {
    await expect(
      withTimeout(() => new Promise((r) => setTimeout(() => r("late"), 100)), 5),
    ).rejects.toThrow(/timeout after 5ms/);
  });

  it("aborts the supplied signal on timeout", async () => {
    let aborted = false;
    await expect(
      withTimeout((signal) => new Promise((_, reject) => {
        signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); });
      }), 5),
    ).rejects.toThrow();
    expect(aborted).toBe(true);
  });

  it("does not abort the signal on the success path", async () => {
    const out = await withTimeout(async (signal) => {
      expect(signal.aborted).toBe(false);
      return 42;
    }, 50);
    expect(out).toBe(42);
  });

  it("propagates a rejection thrown by the fn before the timeout", async () => {
    await expect(
      withTimeout(async () => { throw new Error("boom"); }, 50),
    ).rejects.toThrow(/boom/);
  });
});
