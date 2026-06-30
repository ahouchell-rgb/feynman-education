// Houchell Education — self-serve audit-log read (NOW plan E4 / data-subject
// transparency). GET /api/audit-log   Authorization: Bearer <JWT>
// Returns the caller's OWN recent audit entries (actor-scoped), reusing the
// same audit_log store that src/lib/audit.ts writes. Read-only; never widens
// access beyond the authenticated user's own actions. SLT/school-wide audit
// visibility is a documented follow-up.

import { SK_ANON, SK_URL } from "@/lib/serverHelpers";

export const runtime = "nodejs";


export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return new Response("unauthorized", { status: 401 });
  const token = auth.slice(7);

  let uid = "";
  try {
    const u = await fetch(`${SK_URL}/auth/v1/user`, { headers: { apikey: SK_ANON, Authorization: `Bearer ${token}` } });
    if (!u.ok) return new Response("unauthorized", { status: 401 });
    uid = (await u.json()).id;
  } catch { return new Response("unauthorized", { status: 401 }); }

  // Actor-scoped to the caller. RLS also constrains audit_log reads to the
  // user's own rows, so the explicit actor_id filter is belt-and-braces.
  let entries: any[] = [];
  try {
    const r = await fetch(
      `${SK_URL}/rest/v1/audit_log?actor_id=eq.${uid}&select=action,target,detail,at&order=at.desc&limit=50`,
      { headers: { apikey: SK_ANON, Authorization: `Bearer ${token}` } },
    );
    if (r.ok) entries = await r.json();
  } catch { /* return empty on transient failure */ }

  return new Response(JSON.stringify({ entries }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
