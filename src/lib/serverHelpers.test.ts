import { describe, it, expect, vi, afterEach } from "vitest";
import { extractHtml, anthropicText, bearerToken, pickModel, AI_MODELS, callAnthropic } from "./serverHelpers.js";

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
  it("routes the cheap tier to Haiku", () => {
    expect(pickModel("cheap")).toBe(AI_MODELS.HAIKU);
    expect(AI_MODELS.HAIKU).toBe("claude-haiku-4-5");
  });
});

describe("callAnthropic (retry/backoff)", () => {
  afterEach(() => vi.restoreAllMocks());

  // Stub the backoff so tests don't actually sleep.
  const noDelay = () => 0;
  const mkRes = (status: number, headers: Record<string, string> = {}) =>
    new Response(status === 200 ? JSON.stringify({ ok: true }) : "err", { status, headers });

  it("retries a 503 then returns the 200", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mkRes(503))
      .mockResolvedValueOnce(mkRes(200));
    const res = await callAnthropic({ model: "m" }, { apiKey: "k", delayFn: noDelay });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a persistent 500 up to maxRetries then returns the last error response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(mkRes(500));
    const res = await callAnthropic({ model: "m" }, { apiKey: "k", delayFn: noDelay });
    expect(res.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it("does NOT retry a 400 — returns immediately", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(mkRes(400));
    const res = await callAnthropic({ model: "m" }, { apiKey: "k", delayFn: noDelay });
    expect(res.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry a 401/404 either", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(mkRes(404));
    const res = await callAnthropic({ model: "m" }, { apiKey: "k", delayFn: noDelay });
    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries 429 and honours a Retry-After header via delayFn", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mkRes(429, { "retry-after": "2" }))
      .mockResolvedValueOnce(mkRes(200));
    const seen: Array<number | null> = [];
    const res = await callAnthropic({ model: "m" }, {
      apiKey: "k",
      delayFn: (_attempt, retryAfterMs) => { seen.push(retryAfterMs); return 0; },
    });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(seen[0]).toBe(2000); // Retry-After: 2s → 2000ms surfaced to delayFn
  });

  it("retries on a network throw then succeeds", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockResolvedValueOnce(mkRes(200));
    const res = await callAnthropic({ model: "m" }, { apiKey: "k", delayFn: noDelay });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries on persistent network failure", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network down"));
    await expect(callAnthropic({ model: "m" }, { apiKey: "k", delayFn: noDelay }))
      .rejects.toThrow("network down");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("sends the api key and version headers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(mkRes(200));
    await callAnthropic({ model: "m" }, { apiKey: "secret-key", delayFn: noDelay });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("secret-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(init.method).toBe("POST");
  });
});
