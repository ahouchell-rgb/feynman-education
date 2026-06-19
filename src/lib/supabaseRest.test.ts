import { describe, it, expect } from "vitest";
import { buildRestUrl, restHeaders, restError } from "./supabaseRest.js";

const BASE = "https://proj.supabase.co";

describe("buildRestUrl — PostgREST endpoint construction", () => {
  it("builds the /rest/v1/<table> path", () => {
    const u = buildRestUrl(BASE, "decks");
    expect(u.origin + u.pathname).toBe("https://proj.supabase.co/rest/v1/decks");
  });
  it("appends query params", () => {
    const u = buildRestUrl(BASE, "decks", { select: "id,title", id: "eq.42" });
    expect(u.searchParams.get("select")).toBe("id,title");
    expect(u.searchParams.get("id")).toBe("eq.42");
  });
  it("encodes param values safely", () => {
    const u = buildRestUrl(BASE, "t", { name: "a b&c" });
    expect(u.searchParams.get("name")).toBe("a b&c");
  });
});

describe("restHeaders — header assembly", () => {
  it("always sends content-type + apikey, and Authorization falls back to the apikey", () => {
    const h = restHeaders({ apikey: "anon" });
    expect(h["Content-Type"]).toBe("application/json");
    expect(h.apikey).toBe("anon");
    expect(h.Authorization).toBe("Bearer anon");
  });
  it("uses the bearer token for Authorization when given", () => {
    expect(restHeaders({ apikey: "anon", bearer: "jwt" }).Authorization).toBe("Bearer jwt");
  });
  it("requests a single object when single=true", () => {
    expect(restHeaders({ apikey: "k", single: true }).Accept).toBe("application/vnd.pgrst.object+json");
    expect(restHeaders({ apikey: "k" }).Accept).toBeUndefined();
  });
  it("sets the Prefer header when supplied", () => {
    expect(restHeaders({ apikey: "k", prefer: "return=representation" }).Prefer).toBe("return=representation");
  });
  it("merges extra headers", () => {
    expect(restHeaders({ apikey: "k", extra: { "X-Trace": "1" } })["X-Trace"]).toBe("1");
  });
});

describe("restError — surfacing the PostgREST error message", () => {
  it("uses the response's JSON message field", async () => {
    const r = new Response(JSON.stringify({ message: "duplicate key" }), { status: 409 });
    const e = await restError(r, "fallback");
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe("duplicate key");
  });
  it("falls back when the body has no message", async () => {
    const r = new Response(JSON.stringify({ code: "x" }), { status: 400 });
    expect((await restError(r, "GET decks failed")).message).toBe("GET decks failed");
  });
  it("falls back when the body is not JSON", async () => {
    const r = new Response("<html>502</html>", { status: 502 });
    expect((await restError(r, "boom")).message).toBe("boom");
  });
});
