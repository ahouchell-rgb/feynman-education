import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reportError } from "./observe.js";

describe("reportError", () => {
  const origDsn = process.env.SENTRY_DSN;
  beforeEach(() => { delete process.env.SENTRY_DSN; });
  afterEach(() => { if (origDsn === undefined) delete process.env.SENTRY_DSN; else process.env.SENTRY_DSN = origDsn; vi.restoreAllMocks(); });

  it("falls back to a structured console.error line when no DSN is set", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await reportError(new Error("boom"), { route: "test", n: 1 });
    expect(spy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(spy.mock.calls[0][0] as string);
    expect(payload.level).toBe("error");
    expect(payload.message).toBe("boom");
    expect(payload.route).toBe("test");
    expect(payload.n).toBe(1);
  });

  it("coerces a non-Error value into a message and never throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(reportError("just a string")).resolves.toBeUndefined();
    const payload = JSON.parse(spy.mock.calls[0][0] as string);
    expect(payload.message).toBe("just a string");
  });

  it("POSTs to Sentry when a DSN is configured", async () => {
    process.env.SENTRY_DSN = "https://pubkey@o123.ingest.sentry.io/456";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await reportError(new Error("sent"), { route: "x" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://o123.ingest.sentry.io/api/456/store/");
    expect((init as RequestInit).method).toBe("POST");
    // On a successful Sentry send we do NOT also log to the console.
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("falls back to console when the Sentry POST fails", async () => {
    process.env.SENTRY_DSN = "https://pubkey@o123.ingest.sentry.io/456";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await reportError(new Error("degraded"));
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(consoleSpy.mock.calls[0][0] as string).message).toBe("degraded");
  });
});
