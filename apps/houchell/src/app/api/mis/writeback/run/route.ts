// Houchell Education — push pending MIS write-back now (SLT).
// POST /api/mis/writeback/run   Authorization: Bearer <teacher JWT>
// Drains the caller's school's pending write-back queue to Wonde. SLT only.

import { wondeConfigured, wondeSchoolId, ensureConnection, runWriteback } from "@/lib/wonde";
import { audit } from "@/lib/audit";
import { SK_ANON, SK_URL } from "@/lib/serverHelpers";

export const runtime = "nodejs";
export const maxDuration = 300;

const j = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return j({ error: "Missing bearer token" }, 401);
  const token = auth.slice(7);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return j({ error: "SUPABASE_SERVICE_ROLE_KEY missing" }, 500);
  if (!wondeConfigured()) return j({ error: "MIS not configured (WONDE_TOKEN / WONDE_SCHOOL_ID)." }, 400);

  let uid: string;
  try {
    const u = await fetch(`${SK_URL}/auth/v1/user`, { headers: { apikey: SK_ANON, Authorization: `Bearer ${token}` } });
    if (!u.ok) return j({ error: "Invalid auth" }, 401);
    uid = (await u.json()).id;
  } catch { return j({ error: "Auth check failed" }, 401); }

  let profile: any;
  try {
    const r = await fetch(`${SK_URL}/rest/v1/profiles?id=eq.${uid}&select=school_id,school_role&limit=1`, { headers: { apikey: SK_ANON, Authorization: `Bearer ${token}` } });
    profile = (await r.json())?.[0];
  } catch { return j({ error: "Couldn't load profile" }, 500); }
  if (!profile?.school_id || profile.school_role !== "slt") return j({ error: "Only senior leaders can push write-back." }, 403);

  await ensureConnection(profile.school_id);
  const res = await runWriteback(profile.school_id, wondeSchoolId());
  await audit(uid, "mis.writeback", profile.school_id, res);
  return j(res);
}
