// Feynman Education — shared server helpers (server-only).
// Consolidates the auth / Supabase-REST / AI boilerplate that was copy-pasted
// across ~20 route handlers, so a fix lands once. Pure functions here are unit
// tested in serverHelpers.test.ts.

export const SK_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
// Public anon key (same as src/lib/sk) — safe in source; used as the apikey
// header alongside the caller's bearer.
export const SK_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2enVrd294cWhjeGF4dHpyeml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDUyNTIsImV4cCI6MjA4OTkyMTI1Mn0.PtT24EfMfTckYaq9jXBPRuCsG6utWMLcHs9H8buM70c";

export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

// HAIKU is wired up here and selectable via pickModel("cheap"), but NO route is
// routed onto it yet — every current AI route is quality-sensitive, teacher-facing
// generation (full lessons, practicals, revision packs, slides, feedforward). It's
// available for opt-in on a genuinely short/deterministic, low-stakes route after
// evals, without another infra change.
export const AI_MODELS = { OPUS: "claude-opus-4-8", SONNET: "claude-sonnet-4-6", HAIKU: "claude-haiku-4-5" } as const;
/** Cheap model for bulk/derived generation; Opus only for authoring; Haiku for
 *  cheap, short, low-stakes calls (e.g. the opt-in fact-check). */
export function pickModel(kind: "authoring" | "bulk" | "cheap"): string {
  if (kind === "authoring") return AI_MODELS.OPUS;
  if (kind === "cheap") return AI_MODELS.HAIKU;
  return AI_MODELS.SONNET;
}

// ─── Anthropic call with retry/backoff ───────────────────────────────────
/** Transient HTTP statuses worth retrying: rate limit, server errors, overloaded.
 *  Everything else (other 4xx — bad request, auth, not found) is NOT retried. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529]);
/** Backoff schedule (ms) before attempts 2, 3, 4. ~0.5s, 1s, 2s + jitter. */
const RETRY_BACKOFF_MS = [500, 1000, 2000];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface CallAnthropicOpts {
  apiKey: string;
  /** Abort signal forwarded to fetch (e.g. request cancellation). */
  signal?: AbortSignal;
  /** Override the version header (defaults to ANTHROPIC_VERSION). */
  version?: string;
  /** Max retries after the initial attempt (default 3 → up to 4 total tries). */
  maxRetries?: number;
  /** Test seam: compute the backoff delay for a given attempt. Defaults to the
   *  exponential schedule above with jitter. Return 0 in tests to avoid sleeping. */
  delayFn?: (attempt: number, retryAfterMs: number | null) => number;
}

/** Parse a Retry-After header (seconds, or an HTTP-date) into ms, or null. */
function parseRetryAfter(res: Response): number | null {
  const h = res.headers.get("retry-after");
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const when = Date.parse(h);
  return Number.isFinite(when) ? Math.max(0, when - Date.now()) : null;
}

function defaultDelay(attempt: number, retryAfterMs: number | null): number {
  if (retryAfterMs != null) return retryAfterMs; // server told us how long to wait
  const base = RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)];
  return base + Math.floor(Math.random() * base * 0.5); // +0–50% jitter
}

/** POST a Messages request to Anthropic with retry + exponential backoff on
 *  transient failures (429 / 500 / 502 / 503 / 529 and network throws). Honours a
 *  Retry-After header when present. Other 4xx are returned immediately (no retry).
 *  Returns the final Response — callers read .ok / .status / .json() as before; the
 *  body and all headers (prompt-cache, anthropic-beta, …) are passed through verbatim. */
export async function callAnthropic(body: unknown, opts: CallAnthropicOpts): Promise<Response> {
  const { apiKey, signal, version = ANTHROPIC_VERSION, maxRetries = 3, delayFn = defaultDelay } = opts;
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": version },
        body: payload,
        signal,
      });
      // Success, or a non-retryable error → hand back to the caller as-is.
      if (res.ok || !RETRYABLE_STATUS.has(res.status) || attempt === maxRetries) return res;
      // Retryable: drain the body so the connection can be reused, then back off.
      const retryAfter = parseRetryAfter(res);
      await res.text().catch(() => "");
      await sleep(delayFn(attempt, retryAfter));
    } catch (e) {
      lastErr = e;
      // Don't retry an intentional abort.
      if (signal?.aborted) throw e;
      if (attempt === maxRetries) throw e;
      await sleep(delayFn(attempt, null));
    }
  }
  // Unreachable in practice (loop returns/throws), but satisfies the type checker.
  throw lastErr ?? new Error("callAnthropic: exhausted retries");
}

/** Authorize a Vercel Cron request.
 *  `x-vercel-cron` is an ordinary request header any client can spoof, so once a
 *  CRON_SECRET is configured we require the bearer secret and the header alone is
 *  NOT sufficient. With no secret set we fall back to accepting the header so an
 *  un-configured deployment's crons keep working (set CRON_SECRET to lock them). */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) return req.headers.get("authorization") === `Bearer ${secret}`;
  return req.headers.get("x-vercel-cron") != null;
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
