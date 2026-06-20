// Feynman Education — enqueue MIS attainment write-back (SLT).
// POST /api/mis/writeback/enqueue   Authorization: Bearer <teacher JWT>
// Body: { aspect, source?, items: [{ student_mis_id, value }] }
//
// Queues attainment values (e.g. a predicted-grades CSV) to push back to the MIS.
// SLT only; the actual push is done by the worker (cron or "Push now").

import { enqueueWriteback } from "@/lib/wonde";

export const runtime = "nodejs";
export const maxDuration = 60;

const SK_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
const SK_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2enVrd294cWhjeGF4dHpyeml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDUyNTIsImV4cCI6MjA4OTkyMTI1Mn0.PtT24EfMfTckYaq9jXBPRuCsG6utWMLcHs9H8buM70c";
const j = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return j({ error: "Missing bearer token" }, 401);
  const token = auth.slice(7);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return j({ error: "SUPABASE_SERVICE_ROLE_KEY missing" }, 500);

  let body: any;
  try { body = await req.json(); } catch { return j({ error: "Invalid JSON body" }, 400); }
  const aspect = String(body?.aspect || "").trim();
  const source = ["csv", "predicted_grade", "assessment", "mastery"].includes(body?.source) ? body.source : "csv";
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!aspect) return j({ error: "An aspect (MIS marksheet column) is required." }, 400);
  if (!items.length) return j({ error: "No items to enqueue." }, 400);

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
  if (!profile?.school_id || profile.school_role !== "slt") return j({ error: "Only senior leaders can queue write-back." }, 403);

  try {
    const n = await enqueueWriteback({ schoolId: profile.school_id, createdBy: uid, aspect, source, items });
    return j({ enqueued: n });
  } catch (e: any) {
    return j({ error: e.message }, 500);
  }
}
