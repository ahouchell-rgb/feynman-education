// Feynman Education — shared server helpers (server-only).
// Consolidates the auth / Supabase-REST / AI boilerplate that was copy-pasted
// across ~20 route handlers, so a fix lands once. Pure functions here are unit
// tested in serverHelpers.test.ts.

export const SK_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
// Public anon key (same as src/lib/sk) — safe in source; used as the apikey
// header alongside the caller's bearer.
export const SK_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2enVrd294cWhjeGF4dHpyeml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDUyNTIsImV4cCI6MjA4OTkyMTI1Mn0.PtT24EfMfTckYaq9jXBPRuCsG6utWMLcHs9H8buM70c";

export const AI_MODELS = { OPUS: "claude-opus-4-8", SONNET: "claude-sonnet-4-6" } as const;
/** Cheap model for bulk/derived generation; Opus only for authoring. */
export function pickModel(kind: "authoring" | "bulk"): string {
  return kind === "authoring" ? AI_MODELS.OPUS : AI_MODELS.SONNET;
}

/** Pull a Bearer token out of the request, or null. */
export function bearerToken(req: Request): string | null {
  const a = req.headers.get("authorization") || "";
  return a.startsWith("Bearer ") ? a.slice(7) : null;
}

/** Validate a user JWT and return the uid, or null. */
export async function requireUserId(token: string): Promise<string | null> {
  try {
    const r = await fetch(`${SK_URL}/auth/v1/user`, { headers: { apikey: SK_ANON, Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id || null;
  } catch { return null; }
}

/** RLS-scoped GET (caller's bearer). Returns [] / null on failure unless throwOnError. */
export async function skRest(path: string, token: string, throwOnError = false): Promise<any> {
  const r = await fetch(`${SK_URL}/rest/v1/${path}`, { headers: { apikey: SK_ANON, Authorization: `Bearer ${token}` } });
  if (!r.ok) { if (throwOnError) throw new Error(`${path}: ${r.status}`); return null; }
  return r.json();
}

/** Service-role request (server-only; bypasses RLS). */
export async function skAdmin(method: string, path: string, body?: any): Promise<any> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
  const r = await fetch(`${SK_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json", Prefer: "return=representation", ...(body ? {} : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`);
  return r.status === 204 ? null : r.json();
}

/** Extract an HTML doc from a model reply: ```html block → raw <html> → whole text. */
export function extractHtml(text: string): string {
  const fenced = text.match(/```html\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const doc = text.match(/<!doctype[\s\S]*<\/html>|<html[\s\S]*<\/html>/i);
  if (doc) return doc[0].trim();
  return (text || "").trim();
}

/** Concatenate the text blocks of an Anthropic messages response. */
export function anthropicText(data: any): string {
  return (data?.content || []).filter((b: any) => b?.type === "text").map((b: any) => b.text).join("");
}

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Log token spend into the shared daily pool (service role). Best-effort. */
export async function logTokenUsage(userId: string, usage: any): Promise<void> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !userId) return;
  const input = (usage?.input_tokens || 0) + (usage?.cache_read_input_tokens || 0) + (usage?.cache_creation_input_tokens || 0);
  try {
    await fetch(`${SK_URL}/rest/v1/rpc/increment_token_usage`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ p_teacher_id: userId, p_day: todayISO(), p_input: input, p_output: usage?.output_tokens || 0 }),
    });
  } catch { /* best-effort */ }
}

export const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
