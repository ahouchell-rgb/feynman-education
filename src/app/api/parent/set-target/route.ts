// Feynman Education — parent sets a child's target grade (token-validated).
// POST /api/parent/set-target   body { t, linkId, target }
// Validates that the guardian access token owns the link, then writes the
// target. Service-role write; no parent account required.

import { audit } from "@/lib/audit";

export const runtime = "nodejs";

const SK_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
const j = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function admin(method: string, path: string, body?: any) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const r = await fetch(`${SK_URL}/rest/v1/${path}`, {
    method, headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json", Prefer: "return=representation" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.ok ? r.json() : null;
}

export async function POST(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return j({ error: "not configured" }, 500);
  let body: any; try { body = await req.json(); } catch { return j({ error: "bad body" }, 400); }
  const t = String(body?.t || ""), linkId = String(body?.linkId || ""), target = String(body?.target || "").slice(0, 12);
  if (!/^[0-9a-f-]{36}$/i.test(t) || !/^[0-9a-f-]{36}$/i.test(linkId)) return j({ error: "invalid link" }, 400);

  // The token must belong to the guardian who owns this link.
  const g = await admin("GET", `guardians?access_token=eq.${t}&select=id&limit=1`);
  const guardianId = g?.[0]?.id;
  if (!guardianId) return j({ error: "not found" }, 404);
  const link = await admin("GET", `guardian_student?id=eq.${linkId}&guardian_id=eq.${guardianId}&select=id`);
  if (!link?.length) return j({ error: "not your child" }, 403);

  await admin("PATCH", `guardian_student?id=eq.${linkId}`, { target_grade: target || null });
  await audit(null, "parent.set_target", linkId, { guardian_id: guardianId, target: target || null });
  return j({ ok: true, target });
}
