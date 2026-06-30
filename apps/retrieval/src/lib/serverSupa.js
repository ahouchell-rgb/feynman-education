// SERVER-ONLY Supabase + Anthropic helpers for the API routes.
//
// ⚠️ NEVER import this from a client component — it reads the service-role key and
// the Anthropic key from process.env. Only the Node API routes (server) use it.
//
// Extracted so the paper-feedforward and parse-paper-docx routes share one copy of
// the auth / metering / cost-backstop logic instead of duplicating it (the kind of
// edge-function copy-paste the ecosystem review flagged).

import { SUPA_URL as SUPA_URL_ } from "./supaConfig";

// Shared anchor URL (env-overridable; literal fallback lives once in ./supaConfig).
export const SUPA_URL = SUPA_URL_;
// ANON_KEY intentionally has NO literal fallback here — server auth-validation
// must use the explicitly-configured public key (or be undefined), unchanged.
export const ANON_KEY = process.env.NEXT_PUBLIC_SUPA_KEY;
export const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// Service-role PostgREST helper (raw fetch — the app deliberately has no supabase-js dep).
export async function rest(path, { method = "GET", body, params = {}, single } = {}) {
  const u = new URL(`${SUPA_URL}/rest/v1/${path}`);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const headers = { "Content-Type": "application/json", apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  if (single) headers["Accept"] = "application/vnd.pgrst.object+json";
  if (method === "POST" || method === "PATCH") headers["Prefer"] = "return=representation";
  const r = await fetch(u, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}`);
  if (method === "DELETE") return null;
  return r.json();
}

export async function rpc(fn, args) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify(args),
  });
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

// Identify the caller from their Supabase JWT (also validates the token).
export async function getAuthedUid(req) {
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${m[1]}` } });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id || null;
  } catch { return null; }
}

// Fire-and-forget AI usage logging, same row shape as mark-paper-answer so spend
// shows in the cost dashboard and counts toward the school backstop.
export function logUsage(label, school_id, usage) {
  if (!usage) return;
  rest("ai_usage", { method: "POST", body: {
    call_label: label,
    source: "ai",
    school_id,
    input_tokens: Number(usage.input_tokens) || 0,
    output_tokens: Number(usage.output_tokens) || 0,
    cache_creation_tokens: Number(usage.cache_creation_input_tokens) || 0,
    cache_read_tokens: Number(usage.cache_read_input_tokens) || 0,
  } }).catch((e) => console.error("ai_usage insert failed:", e));
}

// Hard cost backstop (same RPC as mark-paper-answer). Fails OPEN on any error so a
// transient issue never blocks staff.
export async function overBackstop(school_id) {
  if (!school_id) return false;
  try {
    const data = await rpc("school_mark_status", { p_school_id: school_id });
    const r = Array.isArray(data) ? data[0] : data;
    return !!(r && r.over_backstop);
  } catch { return false; }
}

// One Anthropic Messages call. Returns the parsed response JSON ({ content, usage, ... }).
export async function anthropicMessages({ model, max_tokens, system, messages }) {
  const body = { model, max_tokens, messages };
  if (system) body.system = system;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  return r.json();
}

// Pull the first text block out of an Anthropic response and strip code fences.
export function responseText(data) {
  const text = data?.content?.[0]?.text || "";
  return text.replace(/```json|```/g, "").trim();
}
