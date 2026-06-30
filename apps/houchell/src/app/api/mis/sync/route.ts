// Houchell Education — manual MIS sync trigger (SLT).
// POST /api/mis/sync   Authorization: Bearer <teacher JWT>
//
// Runs a Wonde sync for the caller's school now. Restricted to slt. Env-gated:
// returns a clear message if WONDE_TOKEN / WONDE_SCHOOL_ID aren't configured.

import { wondeConfigured, wondeSchoolId, ensureConnection, runMisSync } from "@/lib/wonde";
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
  if (!wondeConfigured()) return j({ error: "MIS not configured. Set WONDE_TOKEN and WONDE_SCHOOL_ID in env." }, 400);

  // Resolve caller + require slt.
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
  if (!profile?.school_id || profile.school_role !== "slt") return j({ error: "Only senior leaders can sync the MIS." }, 403);

  await ensureConnection(profile.school_id);
  const result = await runMisSync(profile.school_id, wondeSchoolId(), "manual");
  await audit(uid, "mis.sync", profile.school_id, { counts: result.counts });
  return j(result, result.ok ? 200 : 502);
}
