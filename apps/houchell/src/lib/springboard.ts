// Houchell Education — home-course (Springboard) sync helpers (server-only).
// Thin service-role REST wrappers + state summarising, shared by the
// /api/springboard/* routes. Mirrors the direct-fetch style of the parent portal.

import { SK_URL } from "@/lib/serverHelpers";

/** Per-pupil link token: URL-safe, 16–64 chars (we mint 24). */
export const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const svcKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const headers = () => ({ apikey: svcKey(), Authorization: `Bearer ${svcKey()}`, "content-type": "application/json" });

/** Service-role GET against PostgREST; returns the parsed array. Throws on non-OK. */
export async function sbGet(path: string): Promise<any[]> {
  const r = await fetch(`${SK_URL}/rest/v1/${path}`, { headers: headers() });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

/** Service-role write (POST/PATCH). `prefer` lets callers upsert
 *  (resolution=merge-duplicates) or skip the body (return=minimal). */
export async function sbWrite(method: string, path: string, body: unknown, prefer = "return=representation"): Promise<any> {
  const r = await fetch(`${SK_URL}/rest/v1/${path}`, {
    method, headers: { ...headers(), Prefer: prefer }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

/** Pull the cheap dashboard summary out of the course's State blob. A "crown" is a
 *  completed lesson node (ids look like "<unitCode>-L<n>"); review/weak sessions
 *  (ids "review-…"/"weak-…") don't count. */
export function summarise(state: any): { xp: number; streak: number; words: number; crowns: number } {
  const lessons = (state && state.lessons) || {};
  let crowns = 0;
  for (const k in lessons) { if (lessons[k] && lessons[k].done && /-L\d+$/.test(k)) crowns++; }
  return {
    xp: Number(state?.xp) || 0,
    streak: Number(state?.streak) || 0,
    words: Number(state?.words) || 0,
    crowns,
  };
}
