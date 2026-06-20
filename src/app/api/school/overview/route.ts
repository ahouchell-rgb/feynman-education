// Feynman Education — SLT/Department dashboard data (strategy Build 2).
// GET /api/school/overview   Authorization: Bearer <teacher JWT>
//
// Returns the caller's school + every class in it (via the security-definer
// school_classes() RPC, which itself only answers hod/slt callers) with each
// class's weakest objectives aggregated from retrieval. The dashboard does the
// cohort roll-up + filtering client-side from this compact payload.
//
// Aggregation reuses class_weak_topics (the same RPC the feedforward cron uses),
// called server-side with the x-sciencekit-key secret so it doesn't depend on
// client-side RPC gating. No personal pupil rows cross the wire — only
// per-objective aggregates.
//
// Env: SK_API_KEY (retrieval RPC). SUPABASE_SERVICE_ROLE_KEY not required.

export const runtime = "nodejs";
export const maxDuration = 60;

const SK_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
const SK_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2enVrd294cWhjeGF4dHpyeml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDUyNTIsImV4cCI6MjA4OTkyMTI1Mn0.PtT24EfMfTckYaq9jXBPRuCsG6utWMLcHs9H8buM70c";

const j = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function rest(path: string, bearer: string) {
  const r = await fetch(`${SK_URL}/rest/v1/${path}`, { headers: { apikey: SK_ANON, Authorization: `Bearer ${bearer}` } });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}
async function rpc(fn: string, body: any, bearer: string, secret?: string) {
  const r = await fetch(`${SK_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: SK_ANON, Authorization: `Bearer ${bearer}`, ...(secret ? { "x-sciencekit-key": secret } : {}) },
    body: JSON.stringify(body),
  });
  return r.ok ? r.json() : [];
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return j({ error: "Missing bearer token" }, 401);
  const token = auth.slice(7);
  const secret = process.env.SK_API_KEY || undefined;

  // Resolve the caller and their staff role.
  let uid: string;
  try {
    const u = await fetch(`${SK_URL}/auth/v1/user`, { headers: { apikey: SK_ANON, Authorization: `Bearer ${token}` } });
    if (!u.ok) return j({ error: "Invalid auth" }, 401);
    uid = (await u.json()).id;
  } catch { return j({ error: "Auth check failed" }, 401); }

  let profile: any;
  try {
    profile = (await rest(`profiles?id=eq.${uid}&select=school_id,school_role&limit=1`, token))?.[0];
  } catch { return j({ error: "Couldn't load profile" }, 500); }

  const role = profile?.school_role || "member";
  if (!profile?.school_id || (role !== "hod" && role !== "slt")) {
    return j({ enabled: false, role });
  }

  // School name (RLS lets a member read their own school).
  let schoolName = "Your school";
  try { schoolName = (await rest(`schools?id=eq.${profile.school_id}&select=name`, token))?.[0]?.name || schoolName; } catch { /* keep default */ }

  // School-wide classes (security-definer RPC; returns [] unless hod/slt).
  let classes: any[] = [];
  try { classes = await rpc("school_classes", {}, token); } catch { classes = []; }
  if (!Array.isArray(classes)) classes = [];

  // Aggregate each class's weakest objectives from retrieval (in parallel).
  const enriched = await Promise.all(classes.map(async (c: any) => {
    const retId = (c.retrieval_class_ids || [])[0];
    let weak: any[] = [];
    if (retId) {
      const rows = await rpc("class_weak_topics", { p_class_id: retId, p_limit: 8, p_min_marked: 5 }, token, secret);
      weak = (Array.isArray(rows) ? rows : []).map((w: any) => ({
        topic_id: w.topic_id, topic_name: w.topic_name,
        pct_correct: Math.round(Number(w.pct_correct)), marked: w.marked ?? null, students: w.students ?? null,
      }));
    }
    return {
      class_id: c.class_id, name: c.name, year_group: c.year_group,
      discipline: c.discipline, tier: c.tier, teacher_name: c.teacher_name,
      linked: !!retId, weak,
    };
  }));

  const years = [...new Set(enriched.map((c) => c.year_group).filter(Boolean))].sort((a, b) => a - b);
  return j({
    enabled: true, role, school: { name: schoolName },
    years, classes: enriched,
    generatedAt: new Date().toISOString(),
  });
}
